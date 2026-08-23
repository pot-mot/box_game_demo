import {Group} from 'three'
import {createSkeleton, type Skeleton} from '../../../skeleton/skeleton.ts'
import {createSkeletonJoint} from '../../../skeleton/joint.ts'

/** 关节 ↔ three Group 绑定 */
export interface GroupJointBinding {
    readonly jointId: string
    readonly group: Group
}

/**
 * 以场景为真源的桥接骨架：
 * - 领域局部 pose 与 three Group 双向同步：updateWorldTransforms 后自动写回 Group（场景图级联生效）；
 * - syncFromScene 以场景为准：从 Group 读回局部（初始化或外部直接修改 Group 后调用）。
 */
export interface SkeletonSceneBridge extends Skeleton {
    syncFromScene: () => void
}

/**
 * 创建桥接骨架：为每个绑定自动创建同名关节并注册。
 * 骨骼段由调用方按需 addBone。
 */
export const createSkeletonFromGroups = (bindings: readonly GroupJointBinding[]): SkeletonSceneBridge => {
    const groupByJointId = new Map<string, Group>()
    for (const {jointId, group} of bindings) {
        if (groupByJointId.has(jointId)) {
            throw new Error(`createSkeletonFromGroups 失败：关节 id 重复（${jointId}）`)
        }
        groupByJointId.set(jointId, group)
    }

    const writeBackToGroups = (): void => {
        for (const [jointId, group] of groupByJointId) {
            const joint = skeleton.findJoint(jointId)
            if (joint === undefined) continue
            group.position.copy(joint.position)
            group.quaternion.copy(joint.rotation)
        }
    }

    const skeleton = createSkeleton({onWorldUpdate: writeBackToGroups})
    for (const {jointId} of bindings) {
        skeleton.addJoint(createSkeletonJoint(jointId, jointId))
    }

    const syncFromScene = (): void => {
        for (const [jointId, group] of groupByJointId) {
            const joint = skeleton.findJoint(jointId)
            if (joint === undefined) continue
            joint.position.copy(group.position)
            joint.rotation.copy(group.quaternion)
        }
        skeleton.updateWorldTransforms()
    }

    syncFromScene()
    return {...skeleton, syncFromScene}
}