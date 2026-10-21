import {describe, it, expect} from 'vitest'
import type {Vector3} from 'three'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {ATTACK_CLIP_JSON} from '../../../../character/weapon/attack_clip_data.ts'
import {HUMANOID_WEAPONS} from '../../forms/humanoid/weapons.ts'
import {buildCharacterSkeletonDefinition} from '../../skeleton/preset.ts'
import {skeletonFromDefinition} from '../../../../skeleton/anim/serialization.ts'
import {sampleClip} from '../../../../skeleton/anim/sampling.ts'
import {getAttackClipById} from './attack_clips.ts'
import {getBaseClipForHoldMode} from './base_clips.ts'
import {isTwoHandedAttackClip, supportGripLocalOf} from './support_hand_bake.ts'

const weaponOfClip = (clipId: string) =>
    HUMANOID_WEAPONS.find(weapon => clipId === weapon.id || clipId.startsWith(`${weapon.id}_`))

/** 逐帧采样 clip，返回副手到副握点的最大距离 */
const maxHandDistance = (clip: BoneAnimationClip, gripLocal: Vector3): number => {
    const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
    const rest = skeleton.readPose()
    const root = skeleton.getRoots()[0]
    const rootRest = root?.position.clone()
    let maxDistance = 0
    const samples = Math.max(2, Math.ceil(clip.duration * 60) + 1)
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
        const hand = skeleton.getWorldPosition('leftHandPivot')
        if (mountPos === undefined || mountRot === undefined || hand === undefined) continue
        const target = gripLocal.clone().applyQuaternion(mountRot).add(mountPos)
        maxDistance = Math.max(maxDistance, hand.distanceTo(target))
    }
    return maxDistance
}

describe('双手共持副手关键帧烘焙', () => {
    it('覆盖全部双手攻击段，并为副手肩肘生成显式关键帧', () => {
        const ids = Object.keys(ATTACK_CLIP_JSON).filter(isTwoHandedAttackClip)
        expect(ids.length).toBeGreaterThanOrEqual(37)
        for (const clipId of ids) {
            const clip = getAttackClipById(clipId)
            for (const jointId of ['leftArmShoulder', 'leftArmElbow']) {
                const track = clip.jointTracks.find(candidate => candidate.targetId === jointId)
                expect(track, `${clipId}/${jointId}`).toBeDefined()
                expect(track!.records.length, `${clipId}/${jointId}`).toBeGreaterThan(3)
                expect(track!.interpolation.type, `${clipId}/${jointId}`).toBe('linear')
            }
        }
    })

    it('采样帧上副手落在主武器副握点附近', () => {
        for (const clipId of Object.keys(ATTACK_CLIP_JSON).filter(isTwoHandedAttackClip)) {
            const weapon = weaponOfClip(clipId)
            expect(weapon, clipId).toBeDefined()
            if (weapon === undefined) continue
            const gripLocal = supportGripLocalOf(weapon)
            expect(gripLocal, clipId).toBeDefined()
            if (gripLocal === undefined) continue

            const clip = getAttackClipById(clipId)
            expect(maxHandDistance(clip, gripLocal), `${clipId} 副手未贴近副握点`).toBeLessThan(0.18)
        }
    })

    it('双手共持的待机 / 行走 / 跳跃基础动作也保持副手握持武器', () => {
        const weapon = HUMANOID_WEAPONS.find(candidate => candidate.id === 'heavy_sword')
        expect(weapon).toBeDefined()
        if (weapon === undefined) return
        const gripLocal = supportGripLocalOf(weapon)
        expect(gripLocal).toBeDefined()
        if (gripLocal === undefined) return

        for (const state of ['idle', 'walking', 'jumping'] as const) {
            const clip = getBaseClipForHoldMode(state, true, 'two_handed', 0, [], 'right', gripLocal)
            for (const jointId of ['leftArmShoulder', 'leftArmElbow']) {
                const track = clip.jointTracks.find(candidate => candidate.targetId === jointId)
                expect(track, `${state}/${jointId}`).toBeDefined()
                expect(track!.records.length, `${state}/${jointId}`).toBeGreaterThan(3)
            }
            expect(maxHandDistance(clip, gripLocal), `${state} 副手未贴近副握点`).toBeLessThan(0.18)
        }
    })

    it('非双手段不写入副手烘焙轨道', () => {
        const clip = getAttackClipById('long_sword_one_handed_light_1')
        const track = clip.jointTracks.find(candidate => candidate.targetId === 'leftArmShoulder')
        const baked = track?.records.length ?? 0
        expect(baked).toBeLessThan(10)
    })
})
