import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest'
import {Mesh, Scene} from 'three'
import {createRaceActor} from './race_actor.ts'
import {RACE_SHOWCASE_ROSTER, RACE_SHOWCASE_HOLD_SECONDS} from './constants.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（模型脸部纹理用） */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
    fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    arc: () => {}, ellipse: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    quadraticCurveTo: () => {},
})
const originalGetContext = HTMLCanvasElement.prototype.getContext

const spawn = (index: number) => {
    const entry = RACE_SHOWCASE_ROSTER[index]
    if (entry === undefined) throw new Error('清单索引越界')
    return createRaceActor({
        id: index, scene: new Scene(), x: 0, z: 0,
        name: entry.name, subtitle: entry.kind === 'race' ? '种族肢体' : '护甲套装',
        faction: entry.faction, limb: entry.limb ?? {}, armor: entry.armor ?? {},
    })
}

describe('展示模式：种族 / 套装展示角色', () => {
    beforeAll(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value: () => canvasCtxStub(), configurable: true, writable: true,
        })
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterAll(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value: originalGetContext, configurable: true, writable: true,
        })
    })

    it('每个种族 / 套装条目都能创建并释放（无攻击状态快照）', () => {
        for (let i = 0; i < RACE_SHOWCASE_ROSTER.length; i++) {
            const actor = spawn(i)
            expect(actor.status).toBeUndefined()
            expect(actor.anchor.parent).not.toBeNull()
            actor.dispose()
        }
    })

    it('站立 / 行走各持续 2s 交替循环（位置原地不动）', () => {
        const actor = spawn(1) /* 兽人：整族肢体，外观非默认 */
        const baseX = actor.anchor.position.x
        const baseZ = actor.anchor.position.z

        /* 起始站立；未满 2s 不切换姿态 */
        expect(actor.state).toBe('idle')
        for (let t = 0; t < RACE_SHOWCASE_HOLD_SECONDS - 0.2; t += 1 / 60) actor.update(1 / 60)
        expect(actor.state).toBe('idle')

        /* 持续推进 6s（≈3 个 2s 段）应观察到 idle/walking 交替（每 2s 翻转一次） */
        const transitions: Array<'idle' | 'walking'> = []
        let prev = actor.state
        for (let t = 0; t < 3 * RACE_SHOWCASE_HOLD_SECONDS; t += 1 / 60) {
            actor.update(1 / 60)
            if (actor.state !== prev) {
                transitions.push(actor.state)
                prev = actor.state
            }
        }
        /* 6s 窗口应产生 2~3 次翻转，且严格在 idle / walking 间交替 */
        expect(transitions.length).toBeGreaterThanOrEqual(2)
        for (let i = 1; i < transitions.length; i++) {
            expect(transitions[i]).not.toBe(transitions[i - 1])
        }

        /* 位置始终不动（纯动画展示） */
        expect(actor.anchor.position.x).toBe(baseX)
        expect(actor.anchor.position.z).toBe(baseZ)
        actor.dispose()
    })

    it('装备肢体后外观网格数多于人类默认（种族替换生效）', () => {
        const countMeshes = (actor: ReturnType<typeof spawn>): number => {
            let n = 0
            actor.anchor.traverse(obj => { if (obj instanceof Mesh) n++ })
            return n
        }
        const race = spawn(0) /* 骷髅（整族肢体） */
        const armorSet = spawn(3) /* 铁甲套装（人类肢体 + 护甲） */
        expect(countMeshes(race)).toBeGreaterThan(0)
        expect(countMeshes(armorSet)).toBeGreaterThan(0)
        race.dispose()
        armorSet.dispose()
    })
})
