import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest'
import {Scene} from 'three'
import {createShowcaseActor} from './actor.ts'
import {MELEE_WEAPON_PRESETS} from '../../character/weapon/melee_weapon.ts'
import {weaponAttacksOf} from '../../character/weapon/catalog.ts'
import {orderedSegments} from '../../character/weapon/attack_chain.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（模型脸部纹理用） */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
    fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    arc: () => {}, ellipse: () => {},
})
const originalGetContext = HTMLCanvasElement.prototype.getContext

describe('展示模式：近战重击满蓄力前置', () => {
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

    it('重击段播放前先定格满蓄力姿势（charging），随后进入同一段的 attacking', () => {
        const scene = new Scene()
        const weapon = MELEE_WEAPON_PRESETS.long_sword
        const actor = createShowcaseActor({
            id: 1, scene, weapon, holdMode: 'one_handed', faction: 0, x: 0, z: 0, weaponName: weapon.name,
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

    it('满蓄力前置时长 = 武器模板的最长蓄力时间（覆写为 2s ≈ 120 帧）', () => {
        const scene = new Scene()
        const base = MELEE_WEAPON_PRESETS.long_sword
        const weapon = {...base, heavyCharge: {maxChargeMultiplier: 300, maxChargeTime: 2, cooldown: 0.8}}
        const actor = createShowcaseActor({
            id: 2, scene, weapon, holdMode: 'one_handed', faction: 0, x: 0, z: 0, weaponName: weapon.name,
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
