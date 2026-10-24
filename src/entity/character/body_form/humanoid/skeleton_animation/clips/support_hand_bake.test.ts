import {describe, it, expect} from 'vitest'
import type {Vector3} from 'three'
import type {BoneAnimationClip} from '../../../../../../skeleton/anim/types.ts'
import {ATTACK_CLIPS} from '../../../../../../entity/character/body_form/humanoid/skeleton_animation/attack_clips/index.ts'
import {skeletonFromDefinition} from '../../../../../../skeleton/anim/serialization.ts'
import {sampleClip} from '../../../../../../skeleton/anim/sampling.ts'
import {buildCharacterSkeletonDefinition} from '../../skeleton/skeleton.ts'
import {getAttackClipById} from './attack_clips.ts'
import {previewHumanoidClip} from '../preview.ts'
import {SUPPORT_HAND_BASE} from './generated/support_hand_base.ts'
import {SUPPORT_HAND_ATTACKS} from './generated/support_hand_attacks.ts'
import {TWO_HANDED_WEAPONS, isTwoHandedAttackClip, supportGripLocalOf, weaponOfClip} from './support_hand_bake.ts'
import {SUPPORT_HAND_VISUAL_TOLERANCE} from '../../../../../../test_setup.ts'

/** 逐帧采样 clip，返回支撑链真实末端（左武器挂点）到副握点的最大距离 */
const maxMountDistance = (clip: BoneAnimationClip, gripLocal: Vector3): number => {
    const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
    const rest = skeleton.readPose()
    const root = skeleton.getRoots()[0]
    const rootRest = root?.position.clone()
    let maxDistance = 0
    const samples = Math.max(2, Math.ceil(clip.duration * 30) + 1)
    for (let i = 0; i < samples; i++) {
        const t = clip.duration * i / (samples - 1)
        skeleton.applyPose(rest)
        skeleton.applyPose(sampleClip(clip, t))
        if (root !== undefined && rootRest !== undefined) {
            root.position.copy(rootRest)
            skeleton.updateWorldTransforms()
        }
        const mountPos = skeleton.getWorldPosition('rightWeaponMount')
        const mountRot = skeleton.getWorldRotation('rightWeaponMount')
        const supportEnd = skeleton.getWorldPosition('leftWeaponMount')
        if (mountPos === undefined || mountRot === undefined || supportEnd === undefined) continue
        const target = gripLocal.clone().applyQuaternion(mountRot).add(mountPos)
        maxDistance = Math.max(maxDistance, supportEnd.distanceTo(target))
    }
    return maxDistance
}

describe('支撑手离线烘焙残差', () => {
    it('全部双手段的支撑链末端落在副握点视觉容忍范围内', () => {
        const ids = Object.keys(ATTACK_CLIPS).filter(isTwoHandedAttackClip)
        expect(ids.length).toBeGreaterThan(0)
        for (const clipId of ids) {
            const weapon = weaponOfClip(clipId)
            expect(weapon, clipId).toBeDefined()
            if (weapon === undefined) continue
            const gripLocal = supportGripLocalOf(weapon)
            expect(gripLocal, clipId).toBeDefined()
            if (gripLocal === undefined) continue
            expect(SUPPORT_HAND_ATTACKS[clipId], clipId).toBeDefined()
            expect(maxMountDistance(getAttackClipById(clipId), gripLocal), clipId)
                .toBeLessThan(SUPPORT_HAND_VISUAL_TOLERANCE)
        }
    })

    it('双手武器的基础状态支撑链末端落在副握点视觉容忍范围内', () => {
        for (const weapon of TWO_HANDED_WEAPONS) {
            const gripLocal = supportGripLocalOf(weapon)
            expect(gripLocal, weapon.classId).toBeDefined()
            if (gripLocal === undefined) continue
            for (const state of ['idle', 'walking', 'jumping'] as const) {
                expect(SUPPORT_HAND_BASE[weapon.classId]?.[state], `${weapon.classId}/${state}`).toBeDefined()
                const clip = previewHumanoidClip({
                    kind: 'base',
                    state,
                    variant: {
                        weaponHeld: true,
                        horizontalSpeed: 0,
                        holdMode: 'two_handed',
                        handedness: 'right',
                        weaponClassId: weapon.classId,
                    },
                })
                expect(maxMountDistance(clip, gripLocal), `${weapon.classId}/${state}`)
                    .toBeLessThan(SUPPORT_HAND_VISUAL_TOLERANCE)
            }
        }
    })
})
