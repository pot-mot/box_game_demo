import {describe, it, expect} from 'vitest'
import {MELEE_WEAPON_PRESETS} from './melee_weapon.ts'
import {orderedSegments} from './attack_chain.ts'
import {weaponAttacksOf} from './catalog.ts'
import {getChargeClipById} from '../../entity/character/appearance/clips/attack_clips.ts'

/**
 * 近战重击蓄力姿势：每个重击段引用的 `chargePoseId` 必须有可解析的专用蓄力 clip
 * （`charge_clip_data.ts` + `charge_pose_edits.ts`），否则运行时按住蓄力会抛错。
 */
describe('近战专用蓄力姿势 clip', () => {
    it('各武器 × 持握模式的蓄力重击段 chargePoseId 均可解析', () => {
        let checked = 0
        for (const weapon of Object.values(MELEE_WEAPON_PRESETS)) {
            for (const mode of weapon.holdModes) {
                for (const segment of orderedSegments(weaponAttacksOf(weapon, mode))) {
                    if (segment.chargePoseId === undefined) continue
                    const clip = getChargeClipById(segment.chargePoseId)
                    expect(clip.duration).toBeGreaterThan(0)
                    expect(clip.jointTracks.length).toBeGreaterThan(0)
                    checked += 1
                }
            }
        }
        /* 6 武器 × 3 模式 × 2 个重击段 = 36 个可蓄力重击段 */
        expect(checked).toBe(36)
    })
})
