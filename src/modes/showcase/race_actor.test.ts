import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest'
import {Scene} from 'three'
import {createRaceActor} from './race_actor.ts'
import {RACE_SHOWCASE_ROSTER} from './constants.ts'
import {SHOWCASE_ACTIONS} from './actor_handle.ts'

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

    it('不再定时切换动作；仅由 setAction 切换（位置原地不动）', () => {
        const actor = spawn(1) /* 兽人：整族肢体，外观非默认 */
        const baseX = actor.anchor.position.x
        const baseZ = actor.anchor.position.z

        expect(actor.state).toBe('idle')
        for (let t = 0; t < 8; t += 1 / 60) actor.update(1 / 60)
        expect(actor.state).toBe('idle')

        actor.setAction('swimming')
        expect(actor.state).toBe('swimming')
        for (let t = 0; t < 3; t += 1 / 60) actor.update(1 / 60)
        expect(actor.state).toBe('swimming')

        actor.setAction('floating')
        expect(actor.state).toBe('floating')

        /* 位置始终不动（纯动画展示） */
        expect(actor.anchor.position.x).toBe(baseX)
        expect(actor.anchor.position.z).toBe(baseZ)
        actor.dispose()
    })

    it('可切换到全部非攻击动作，包含游泳 / 漂浮，且不含攻击态', () => {
        expect(SHOWCASE_ACTIONS).toContain('swimming')
        expect(SHOWCASE_ACTIONS).toContain('floating')
        expect(SHOWCASE_ACTIONS).not.toContain('attacking')
        expect(SHOWCASE_ACTIONS).not.toContain('air_attacking')

        const actor = spawn(0)
        for (const action of SHOWCASE_ACTIONS) {
            actor.setAction(action)
            expect(actor.state).toBe(action)
            actor.update(1 / 60)
        }
        actor.dispose()
    })
})
