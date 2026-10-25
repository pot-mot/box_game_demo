import {describe, it, expect} from 'vitest'
import {Euler, Vector3} from 'three'
import {buildCharacterSkeletonDefinition} from '../../skeleton/skeleton.ts'
import {skeletonFromDefinition} from '../../../../../../skeleton/anim/serialization.ts'
import {sampleClip} from '../../../../../../skeleton/anim/sampling.ts'
import {getAttackClipById} from '../clips/attack_clips.ts'
import {previewHumanoidClip} from '../preview.ts'
import {ATTACK_CLIPS} from './index.ts'
import {WEAPON_READY_ELBOW, WEAPON_READY_SHOULDER} from '../../state/constants.ts'
import {WEAPON_GRIP_FLEX} from '../../../../appearance/constants.ts'

const LONG_BOW_VARIANT = {
    weaponHeld: true,
    horizontalSpeed: 0,
    holdMode: 'two_handed' as const,
    handedness: 'right' as const,
    weaponClassId: 'longbow',
}

const sampleSkeleton = (clip: ReturnType<typeof getAttackClipById>, t: number) => {
    const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
    skeleton.applyPose(skeleton.readPose())
    skeleton.applyPose(sampleClip(clip, t))
    skeleton.updateWorldTransforms()
    return skeleton
}

describe('长弓持握与拉弓动作', () => {
    it('待机 / 行走时弓身竖直、箭向水平朝前', () => {
        for (const state of ['idle', 'walking'] as const) {
            const clip = previewHumanoidClip({kind: 'base', state, variant: LONG_BOW_VARIANT})
            const skeleton = sampleSkeleton(clip, 0)
            const rotation = skeleton.getWorldRotation('rightWeaponMount')
            expect(rotation).toBeDefined()
            const arrow = new Vector3(0, 1, 0).applyQuaternion(rotation!)
            const limb = new Vector3(0, 0, 1).applyQuaternion(rotation!)
            expect(Math.abs(arrow.z), state).toBeGreaterThan(0.99)
            expect(Math.abs(limb.y), state).toBeGreaterThan(0.99)
        }
    })

    it('拉弓时持弓手固定、持弦手向后拉，且身体偏转至少 0.3rad', () => {
        const clip = getAttackClipById('longbow_shot')
        const start = sampleSkeleton(clip, 0)
        const draw = sampleSkeleton(clip, 0.48)
        const release = sampleSkeleton(clip, 0.96)

        const startRight = start.getWorldPosition('rightWeaponMount')!
        const drawRight = draw.getWorldPosition('rightWeaponMount')!
        const releaseRight = release.getWorldPosition('rightWeaponMount')!
        expect(drawRight.distanceTo(startRight)).toBeLessThan(1e-4)
        expect(releaseRight.distanceTo(startRight)).toBeLessThan(1e-4)

        const startLeft = start.getWorldPosition('leftWeaponMount')!
        const drawLeft = draw.getWorldPosition('leftWeaponMount')!
        expect(drawLeft.z).toBeLessThan(startLeft.z - 0.1)

        const spine = release.findJoint('spine')
        expect(spine).toBeDefined()
        expect(Math.abs(new Euler().setFromQuaternion(spine!.rotation, 'XYZ').y)).toBeGreaterThan(0.3)
    })
})

describe('巨力武器重击 / 上举轻击左右张开幅度', () => {
    const HEAVY_CLIPS = Object.keys(ATTACK_CLIPS).filter(clipId =>
        /^(short_sword|long_sword|heavy_sword|dual_axe)_(one_handed|two_handed|dual_wield)_heavy_[12]$/.test(clipId))
    const LIGHT_CLIPS = Object.keys(ATTACK_CLIPS).filter(clipId =>
        /^(short_sword|long_sword|heavy_sword|dual_axe)_(one_handed|two_handed|dual_wield)_light_[123]$/.test(clipId))
    const AIR_CLIPS = Object.keys(ATTACK_CLIPS).filter(clipId =>
        /^(short_sword|long_sword|heavy_sword|dual_axe)_(one_handed|two_handed|dual_wield)_air_[12]$/.test(clipId))
    const DUAL_CLIPS = Object.keys(ATTACK_CLIPS).filter(clipId =>
        /^(short_sword|long_sword|heavy_sword|dual_axe)_dual_wield_/.test(clipId))

    const shoulderRz = (
        skeleton: ReturnType<typeof sampleSkeleton>,
        side: 'right' | 'left',
    ): number => {
        const shoulder = skeleton.findJoint(`${side}ArmShoulder`)!
        return new Euler().setFromQuaternion(shoulder.rotation, 'XYZ').z * 180 / Math.PI
    }

    it('全部重击起手帧肩关节左右张开不超过 30°', () => {
        expect(HEAVY_CLIPS.length).toBe(24)
        for (const clipId of HEAVY_CLIPS) {
            const clip = getAttackClipById(clipId)
            const authored = ATTACK_CLIPS[clipId]!
            const skeleton = sampleSkeleton(clip, authored.times[1]!)
            const limit = clipId.startsWith('dual_axe_') ? 8.7 : 30.1
            expect(Math.abs(shoulderRz(skeleton, 'right')), clipId).toBeLessThanOrEqual(limit)
            if (!clipId.includes('two_handed')) {
                expect(Math.abs(shoulderRz(skeleton, 'left')), clipId).toBeLessThanOrEqual(limit)
            }
        }
    })

    it('上举式轻击起手帧肩关节左右张开不超过 30°（战斧 0.15rad），且保留双手上抬高度', () => {
        let checked = 0
        for (const clipId of LIGHT_CLIPS) {
            const clip = getAttackClipById(clipId)
            const authored = ATTACK_CLIPS[clipId]!
            const skeleton = sampleSkeleton(clip, authored.times[1]!)
            const rightHandY = skeleton.getWorldPosition('rightHandPivot')!.y
            if (rightHandY <= 0.9) continue
            checked++
            const limit = clipId.startsWith('dual_axe_') ? 8.7 : 30.1
            expect(Math.abs(shoulderRz(skeleton, 'right')), clipId).toBeLessThanOrEqual(limit)
            if (!clipId.includes('two_handed')) {
                expect(Math.abs(shoulderRz(skeleton, 'left')), clipId).toBeLessThanOrEqual(limit)
            }
            if (clipId.startsWith('dual_axe_dual_wield_')) {
                expect(skeleton.getWorldPosition('leftHandPivot')!.y, clipId).toBeGreaterThan(0.9)
            }
        }
        expect(checked).toBe(14)
    })

    it('空中攻击起手帧肩关节左右张开不超过 30°', () => {
        expect(AIR_CLIPS.length).toBe(15)
        for (const clipId of AIR_CLIPS) {
            const clip = getAttackClipById(clipId)
            const authored = ATTACK_CLIPS[clipId]!
            const skeleton = sampleSkeleton(clip, authored.times[1]!)
            const limit = clipId.startsWith('dual_axe_') ? 8.7 : 30.1
            expect(Math.abs(shoulderRz(skeleton, 'right')), clipId).toBeLessThanOrEqual(limit)
            if (!clipId.includes('two_handed')) {
                expect(Math.abs(shoulderRz(skeleton, 'left')), clipId).toBeLessThanOrEqual(limit)
            }
        }
    })

    it('战斧双持副手在所有关键帧与主手完全镜像，命中窗口同帧', () => {
        const clips = Object.keys(ATTACK_CLIPS).filter(clipId => clipId.startsWith('dual_axe_dual_wield_'))
        expect(clips.length).toBe(5)
        for (const clipId of clips) {
            const clip = getAttackClipById(clipId)
            const authored = ATTACK_CLIPS[clipId]!
            for (const time of authored.times) {
                const skeleton = sampleSkeleton(clip, time)
                const euler = (jointId: string): Euler =>
                    new Euler().setFromQuaternion(skeleton.findJoint(jointId)!.rotation, 'XYZ')
                for (const [rightId, leftId] of [
                    ['rightArmShoulder', 'leftArmShoulder'],
                    ['rightArmElbow', 'leftArmElbow'],
                    ['rightWeaponMount', 'leftWeaponMount'],
                ] as const) {
                    const right = euler(rightId)
                    const left = euler(leftId)
                    expect(left.x, `${clipId}/${leftId}@${time}`).toBeCloseTo(right.x, 5)
                    expect(left.y, `${clipId}/${leftId}@${time}`).toBeCloseTo(-right.y, 5)
                    expect(left.z, `${clipId}/${leftId}@${time}`).toBeCloseTo(-right.z, 5)
                }
            }
            const mainTimes = new Map(authored.events
                ?.filter(event => event.slotKey === 'weapon:main_hand')
                .map(event => [event.name, event.time]))
            for (const event of authored.events ?? []) {
                if (event.slotKey !== 'weapon:off_hand') continue
                expect(event.time, `${clipId}/${event.name}`).toBeCloseTo(mainTimes.get(event.name)!, 6)
            }
        }
    })

    it('双持攻击首帧副手与双持待机握持姿态一致', () => {
        expect(DUAL_CLIPS.length).toBe(21)
        for (const clipId of DUAL_CLIPS) {
            const skeleton = sampleSkeleton(getAttackClipById(clipId), 0)
            const shoulder = new Euler().setFromQuaternion(skeleton.findJoint('leftArmShoulder')!.rotation, 'XYZ')
            const elbow = new Euler().setFromQuaternion(skeleton.findJoint('leftArmElbow')!.rotation, 'XYZ')
            const mount = new Euler().setFromQuaternion(skeleton.findJoint('leftWeaponMount')!.rotation, 'XYZ')
            expect(shoulder.x, clipId).toBeCloseTo(WEAPON_READY_SHOULDER, 5)
            expect(shoulder.y, clipId).toBeCloseTo(0, 5)
            expect(shoulder.z, clipId).toBeCloseTo(0, 5)
            expect(elbow.x, clipId).toBeCloseTo(WEAPON_READY_ELBOW, 5)
            expect(mount.x, clipId).toBeCloseTo(WEAPON_GRIP_FLEX, 5)
        }
    })
})


describe('长枪攻击', () => {
    const SPEAR_CLIPS = Object.keys(ATTACK_CLIPS).filter(clipId => clipId.startsWith('spear_'))

    const weaponDirection = (clipId: string, time: number): Vector3 => {
        const skeleton = sampleSkeleton(getAttackClipById(clipId), time)
        return new Vector3(0, 1, 0).applyQuaternion(skeleton.getWorldRotation('rightWeaponMount')!)
    }

    it('全部攻击关键帧肘 / 手在躯干包围盒外，不再横穿身体', () => {
        const TORSO_HALF_X = 0.125
        const TORSO_HALF_Z = 0.09
        for (const clipId of SPEAR_CLIPS) {
            const clip = getAttackClipById(clipId)
            const authored = ATTACK_CLIPS[clipId]!
            for (let index = 1; index < authored.times.length - 1; index++) {
                const skeleton = sampleSkeleton(clip, authored.times[index]!)
                for (const side of ['right', 'left'] as const) {
                    for (const joint of ['ArmElbow', 'HandPivot'] as const) {
                        const p = skeleton.getWorldPosition(`${side}${joint}`)!
                        if (p.y < 0.45 || p.y > 0.9) continue
                        const margin = Math.max(Math.abs(p.x) - TORSO_HALF_X, Math.abs(p.z) - TORSO_HALF_Z)
                        expect(margin, `${clipId}/${side}${joint}@${authored.times[index]}`).toBeGreaterThan(0)
                    }
                }
            }
        }
    })

    it('重击一段在打击帧完全朝正前方', () => {
        for (const mode of ['one_handed', 'two_handed', 'dual_wield']) {
            const dir = weaponDirection(`spear_${mode}_heavy_1`, 0.72)
            expect(Math.abs(dir.x), mode).toBeLessThan(1e-4)
            expect(Math.abs(dir.y), mode).toBeLessThan(1e-4)
            expect(dir.z, mode).toBeGreaterThan(0.999)
        }
    })

    it('重击二段先正向、再向下刺出、再向上挑起', () => {
        for (const mode of ['one_handed', 'two_handed', 'dual_wield']) {
            const clipId = `spear_${mode}_heavy_2`
            const upTime = mode === 'dual_wield' ? 1.018876 : 0.96
            const start = weaponDirection(clipId, 0.48)
            const down = weaponDirection(clipId, 0.72)
            const up = weaponDirection(clipId, upTime)
            expect(Math.abs(start.x), `${mode}/start`).toBeLessThan(1e-4)
            expect(start.z, `${mode}/start`).toBeGreaterThan(0.999)
            expect(Math.abs(down.x), `${mode}/down`).toBeLessThan(1e-4)
            expect(down.y, `${mode}/down`).toBeLessThan(-0.3)
            expect(Math.abs(up.x), `${mode}/up`).toBeLessThan(1e-4)
            expect(up.y, `${mode}/up`).toBeGreaterThan(0.3)
        }
    })
})
