import {describe, it, expect} from 'vitest'
import {Group, Vector3} from 'three'
import {clearTwoHandGripRoot, computeTwoHandGripTarget, leftGripJointId, solveTwoHandedGrip} from './two_handed_ik.ts'
import {skeletonFromDefinition} from '../../../skeleton/anim/serialization.ts'
import {buildCharacterSkeletonDefinition} from '../../skeleton/preset.ts'

/** 共享双手共持 IK：末端解析、副握点计算、CCD 求解与 IK 根清理 */
describe('双手共持 IK（two_handed_ik）', () => {
    const buildSkeleton = () => skeletonFromDefinition(buildCharacterSkeletonDefinition())

    /** 去掉若干关节（同时去掉引用它们的骨骼段，避免定义非法） */
    const stripped = (removeJointIds: readonly string[]) => {
        const definition = buildCharacterSkeletonDefinition()
        const removed = new Set(removeJointIds)
        return skeletonFromDefinition({
            joints: definition.joints.filter(joint => !removed.has(joint.id)),
            bones: definition.bones.filter(bone => !removed.has(bone.headJointId) && !removed.has(bone.tailJointId)),
        })
    }

    it('左手链末端优先级：左手武器挂点 → 左腕 → 左手', () => {
        expect(leftGripJointId(buildSkeleton())).toBe('leftWeaponMount')
        expect(leftGripJointId(stripped(['leftWeaponMount']))).toBe('leftWristPivot')
        expect(leftGripJointId(stripped(['leftWeaponMount', 'leftWristPivot']))).toBe('leftHandPivot')
    })

    it('副握点 = 武器 Group 本地 +Y 偏移（沿武器轴）', () => {
        const skeleton = buildSkeleton()
        const mount = new Group()
        mount.position.set(1, 2, 3)
        const out = new Vector3()
        expect(computeTwoHandGripTarget(skeleton, mount, 0.45, out)!.toArray()).toEqual([1, 2.45, 3])
    })

    it('求解后末端到达副握点，左肩标记 IK 根；清理后解除', () => {
        const skeleton = buildSkeleton()
        const shoulder = skeleton.getWorldPosition('leftArmShoulder')!
        const mount = new Group()
        /* 目标点放在左肩附近（臂展内），沿武器轴 +Y 偏移 */
        mount.position.copy(shoulder).add(new Vector3(0, -0.3, 0.2))
        const target = computeTwoHandGripTarget(skeleton, mount, 0.45, new Vector3())!

        const solved = solveTwoHandedGrip(skeleton, mount, {shoulderId: 'leftArmShoulder', offset: 0.45})
        expect(solved).toBe(true)
        expect(skeleton.findJoint('leftArmShoulder')!.ikRootLevel).toBe(0)
        const end = skeleton.getWorldPosition(leftGripJointId(skeleton))!
        expect(end.distanceTo(target)).toBeLessThan(0.02)

        clearTwoHandGripRoot(skeleton)
        expect(skeleton.findJoint('leftArmShoulder')!.ikRootLevel).toBeUndefined()
    })
})
