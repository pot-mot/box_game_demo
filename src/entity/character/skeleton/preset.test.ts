import {describe, it, expect} from 'vitest'
import {buildCharacterSkeletonDefinition, PRESET_PART_SIZES} from './preset.ts'
import {skeletonFromDefinition} from '../../../skeleton/anim/serialization.ts'
import {MODEL_BASE_HEIGHT, HIP_Y} from '../../../render/constants.ts'

/** 人形预设骨架：锚点位置与头部骨骼段约定 */
describe('人形预设骨架定义', () => {
    it('root 为脚底锚点：脚底关节落在地面 y=0，无关节沉入地面以下', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        const heights = [...skeleton.joints.keys()].map(id => skeleton.getWorldPosition(id)!.y)
        expect(skeleton.getWorldPosition('rightFoot')!.y).toBeCloseTo(0)
        expect(skeleton.getWorldPosition('leftFoot')!.y).toBeCloseTo(0)
        expect(Math.min(...heights)).toBeCloseTo(0)
        expect(Math.max(...heights)).toBeCloseTo(MODEL_BASE_HEIGHT)
    })

    it('髋部关节抬至腿高，颈根位于躯干顶端（肩部同高）', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        expect(skeleton.getWorldPosition('spine')!.y).toBeCloseTo(HIP_Y)
        expect(skeleton.getWorldPosition('headNeck')!.y).toBeCloseTo(HIP_Y + PRESET_PART_SIZES.bodyH)
        expect(skeleton.getWorldPosition('rightArmShoulder')!.y).toBeCloseTo(HIP_Y + PRESET_PART_SIZES.bodyH)
    })

    it('头顶关节收束头部段：躯干/头部段均为沿脊柱向上的正长段', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        expect(skeleton.getWorldPosition('headTop')!.y).toBeCloseTo(MODEL_BASE_HEIGHT)
        const torso = skeleton.findBone('torso')
        const head = skeleton.findBone('head')
        expect(torso?.head.id).toBe('spine')
        expect(torso?.tail.id).toBe('headNeck')
        expect(torso?.length).toBeCloseTo(PRESET_PART_SIZES.bodyH)
        expect(head?.head.id).toBe('headNeck')
        expect(head?.tail.id).toBe('headTop')
        expect(head?.length).toBeCloseTo(PRESET_PART_SIZES.headH)
    })

    it('武器挂点：右/左手武器挂点为腕下零偏移关节（武器占用的两个骨骼位）', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        const rightMount = skeleton.findJoint('rightWeaponMount')
        const leftMount = skeleton.findJoint('leftWeaponMount')
        expect(rightMount?.parent?.id).toBe('rightWristPivot')
        expect(leftMount?.parent?.id).toBe('leftWristPivot')
        /* 零偏移：挂点世界位置与对应手腕重合（武器握把中心落在腕节点上） */
        for (const [mountId, wristId] of [['rightWeaponMount', 'rightWristPivot'], ['leftWeaponMount', 'leftWristPivot']] as const) {
            const mountPos = skeleton.getWorldPosition(mountId)!
            const wristPos = skeleton.getWorldPosition(wristId)!
            expect(mountPos.distanceTo(wristPos)).toBeCloseTo(0, 6)
        }
        /* 挂点仅作挂载/IK 目标：不参与骨骼段（避免退化零长段） */
        const boneJointIds = [...skeleton.bones.values()].flatMap(bone => [bone.head.id, bone.tail.id])
        expect(boneJointIds).not.toContain('rightWeaponMount')
        expect(boneJointIds).not.toContain('leftWeaponMount')
    })

    it('手部骨骼段：右手/左手段连接 HandPivot→WristPivot，与武器挂点分属不同关节', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        for (const [boneId, handId, wristId, mountId] of [
            ['rightHand', 'rightHandPivot', 'rightWristPivot', 'rightWeaponMount'],
            ['leftHand', 'leftHandPivot', 'leftWristPivot', 'leftWeaponMount'],
        ] as const) {
            const bone = skeleton.findBone(boneId)
            expect(bone?.head.id).toBe(handId)
            expect(bone?.tail.id).toBe(wristId)
            expect(skeleton.findJoint(mountId)?.parent?.id).toBe(wristId)
        }
    })
})
