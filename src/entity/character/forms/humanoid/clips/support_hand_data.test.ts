import {describe, it, expect} from 'vitest'
import {BASE_POSE_SAMPLERS} from '../pose_fns.ts'
import {TWO_HANDED_WEAPONS, computeSupportHandFingerprint, isTwoHandedAttackClip, weaponOfClip} from './support_hand_bake.ts'
import {SUPPORT_HAND_BASE} from './generated/support_hand_base.ts'
import {SUPPORT_HAND_ATTACKS} from './generated/support_hand_attacks.ts'
import {SUPPORT_HAND_BAKE_FINGERPRINT} from './generated/support_hand_fingerprint.ts'
import {ATTACK_CLIPS} from '../../../../../character/weapon/attack_clips/index.ts'

describe('支撑手离线烘焙数据', () => {
    it('基础状态矩阵完整：每个双手武器 × 每个基础状态都有双轨', () => {
        for (const weapon of TWO_HANDED_WEAPONS) {
            const states = SUPPORT_HAND_BASE[weapon.classId]
            expect(states, weapon.classId).toBeDefined()
            for (const state of Object.keys(BASE_POSE_SAMPLERS)) {
                const track = states?.[state]
                expect(track, `${weapon.classId}/${state}`).toBeDefined()
                expect(track!.times.length, `${weapon.classId}/${state}`).toBeGreaterThan(0)
                expect(track!.shoulder.length, `${weapon.classId}/${state}`).toBe(track!.times.length)
                expect(track!.elbow.length, `${weapon.classId}/${state}`).toBe(track!.times.length)
            }
        }
    })

    it('攻击支撑手数据与双手段集合完全一致', () => {
        const expected = Object.keys(ATTACK_CLIPS).filter(isTwoHandedAttackClip)
        expect(Object.keys(SUPPORT_HAND_ATTACKS).sort()).toEqual(expected.sort())
        for (const clipId of expected) {
            expect(weaponOfClip(clipId), clipId).toBeDefined()
        }
    })

    it('生成数据 fingerprint 与当前 pose_fns / 武器网格一致', () => {
        expect(computeSupportHandFingerprint()).toBe(SUPPORT_HAND_BAKE_FINGERPRINT)
    })
})
