import {Group} from 'three'
import {createSkeleton, type Skeleton} from '../../../skeleton/skeleton.ts'
import {connectJoint, createSkeletonJoint} from '../../../skeleton/joint.ts'

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
 * autoConnect = true 时按 three Group 父子关系自动建立关节树连接
 * （bindings 中 group.parent 命中的绑定互为父子）。
 * 骨骼段由调用方按需 addBone。
 */
export const createSkeletonFromGroups = (
    bindings: readonly GroupJointBinding[],
    autoConnect = false,
): SkeletonSceneBridge => {
    const groupByJointId = new Map<string, Group>()
    const bindingByGroup = new Map<Group, GroupJointBinding>()
    for (const binding of bindings) {
        if (groupByJointId.has(binding.jointId)) {
            throw new Error(`createSkeletonFromGroups 失败：关节 id 重复（${binding.jointId}）`)
        }
        groupByJointId.set(binding.jointId, binding.group)
        bindingByGroup.set(binding.group, binding)
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
    const jointsById = new Map<string, ReturnType<typeof createSkeletonJoint>>()
    for (const {jointId} of bindings) {
        const joint = createSkeletonJoint(jointId, jointId)
        jointsById.set(jointId, joint)
        skeleton.addJoint(joint)
    }
    if (autoConnect) {
        for (const {jointId, group} of bindings) {
            if (group.parent === null || !(group.parent instanceof Group)) continue
            const parentBinding = bindingByGroup.get(group.parent)
            if (parentBinding === undefined) continue
            const parent = jointsById.get(parentBinding.jointId)
            const child = jointsById.get(jointId)
            if (parent !== undefined && child !== undefined) {
                connectJoint(parent, child)
            }
        }
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