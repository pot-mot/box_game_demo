import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest'
import {Scene} from 'three'
import {createShowcaseActor} from './actor.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../character/weapon/catalog.ts'
import {createWeaponRuntime} from '../../character/weapon/weapon_runtime.ts'
import {composeWithHeavySlot} from '../../character/combat/attack_modules.ts'
import {orderedSegments} from '../../character/weapon/attack_chain.ts'

const longSwordPreset = findWeaponPreset('long_sword')!

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（模型脸部纹理用） */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
    fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    arc: () => {}, ellipse: () => {},
})
const originalGetContext = HTMLCanvasElement.prototype.getContext

describe('展示模式：近战重击蓄力前置', () => {
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

    it('重击段播放前先缓慢蓄力（charging），随后进入同一段的 attacking', () => {
        const scene = new Scene()
        const weapon = longSwordPreset
        const actor = createShowcaseActor({
            id: 1, scene, weapon, attackModule: 'one_handed', faction: 0, x: 0, z: 0, weaponName: weapon.name,
        })
        const segments = orderedSegments(weaponAttacksOf(weapon, 'one_handed'))
        const firstHeavyPos = segments.findIndex(segment => segment.key === 'heavy')
        expect(firstHeavyPos).toBeGreaterThan(0)

        const timeline: Array<{mode: string; hit: number; phase: string}> = []
        for (let i = 0; i < 1200; i++) {
            actor.update(1 / 60)
            const st = actor.status()
            timeline.push({mode: st.mode, hit: st.hitNumber, phase: st.phaseName})
        }

        /* 第一个重击段（hitNumber = firstHeavyPos+1）播放前应出现 charging 前置 */
        const chargeIdx = timeline.findIndex(entry => entry.mode === 'charging' && entry.hit === firstHeavyPos + 1)
        expect(chargeIdx).toBeGreaterThanOrEqual(0)
        expect(timeline[chargeIdx].phase).toBe('charging')
        /* charging 之后进入同一段的 attacking */
        expect(timeline.slice(chargeIdx + 1).some(entry => entry.mode === 'attacking' && entry.hit === firstHeavyPos + 1)).toBe(true)

        actor.dispose()
    })

    it('蓄力前置缓慢推进（不再瞬间满蓄力）：phaseProgress 单调递增到接近 1', () => {
        const scene = new Scene()
        const weapon = longSwordPreset
        const actor = createShowcaseActor({
            id: 3, scene, weapon, attackModule: 'one_handed', faction: 0, x: 0, z: 0, weaponName: weapon.name,
        })
        const segments = orderedSegments(weaponAttacksOf(weapon, 'one_handed'))
        const firstHeavy = segments.findIndex(segment => segment.key === 'heavy') + 1

        const progress: number[] = []
        for (let i = 0; i < 2000; i++) {
            actor.update(1 / 60)
            const st = actor.status()
            if (st.mode === 'charging' && st.hitNumber === firstHeavy) {
                progress.push(st.phaseProgress)
                continue
            }
            if (progress.length > 0) break
        }
        /* 满蓄力 1s ≈ 60 帧：蓄力过程应有明显多帧，而不是一帧跳到满 */
        expect(progress.length).toBeGreaterThan(30)
        expect(progress[0]).toBeLessThan(0.1)
        expect(progress[Math.floor(progress.length / 2)]).toBeGreaterThan(0.3)
        expect(progress[Math.floor(progress.length / 2)]).toBeLessThan(0.75)
        /* 首帧即满蓄力（瞬间完成）会让末帧之前就已到 1，故倒数第 3 帧仍未满 */
        expect(progress[progress.length - 3]).toBeLessThan(1)
        for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1])
        actor.dispose()
    })

    it('蓄力前置时长 = 段有效蓄力时长（覆写为 2s ≈ 120 帧）', () => {
        const scene = new Scene()
        const weapon = createWeaponRuntime('long_sword', {charge: {maxChargeMultiplier: 300, maxChargeTime: 2}}).weapon
        const actor = createShowcaseActor({
            id: 2, scene, weapon, attackModule: 'one_handed', faction: 0, x: 0, z: 0, weaponName: weapon.name,
        })
        const segments = orderedSegments(weaponAttacksOf(weapon, 'one_handed'))
        const firstHeavy = segments.findIndex(segment => segment.key === 'heavy') + 1

        let chargingStart = -1
        let attackingStart = -1
        for (let i = 0; i < 2000; i++) {
            actor.update(1 / 60)
            const st = actor.status()
            if (chargingStart < 0 && st.mode === 'charging' && st.hitNumber === firstHeavy) chargingStart = i
            if (chargingStart >= 0 && st.mode === 'attacking' && st.hitNumber === firstHeavy) {
                attackingStart = i
                break
            }
        }
        expect(chargingStart).toBeGreaterThanOrEqual(0)
        expect(attackingStart - chargingStart).toBeGreaterThanOrEqual(115)
        expect(attackingStart - chargingStart).toBeLessThanOrEqual(125)
        actor.dispose()
    })
})

describe('展示模式：远程弹丸与吐息模组', () => {
    const makeActor = (id: number, weaponId: string, attackModule: string, extra: {bodyFormId?: string; attacks?: import('../../character/weapon/attack_chain.ts').WeaponAttacks; attackWeapons?: ReadonlyMap<string, import('../../character/weapon/catalog.ts').WeaponConfig>} = {}) => {
        const weapon = findWeaponPreset(weaponId)!
        return createShowcaseActor({
            id, scene: new Scene(), weapon, attackModule, faction: 0, x: 0, z: 0, weaponName: weapon.name, ...extra,
        })
    }

    it('远程攻击真正生成弹丸视觉（不结算伤害）', () => {
        const actor = makeActor(10, 'longbow', 'two_handed')
        for (let i = 0; i < 180; i++) actor.update(1 / 60)
        expect(actor.projectileCount()).toBeGreaterThan(0)
        actor.dispose()
    })

    it('龙吐息模组的 heavy 段生成对应吐息弹丸', () => {
        const weapon = findWeaponPreset('wyvern_claw')!
        const breath = createWeaponRuntime('breath_fireball')
        if (breath.weapon.type !== 'ranged') throw new Error('火球吐息应为远程')
        const composed = composeWithHeavySlot(weaponAttacksOf(weapon, 'breath'), breath)
        const actor = makeActor(11, 'wyvern_claw', 'breath', {
            bodyFormId: 'wyvern',
            attacks: composed.attacks,
            attackWeapons: composed.attackWeapons,
        })
        let fired = false
        for (let i = 0; i < 1200 && !fired; i++) {
            actor.update(1 / 60)
            fired = actor.projectileCount() > 0
        }
        expect(fired).toBe(true)
        actor.dispose()
    })
})
