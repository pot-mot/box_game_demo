import {Group, Quaternion, Vector3} from 'three'
import {createSkeleton, type Skeleton, type SkeletonOptions} from '../../../skeleton/skeleton.ts'
import {connectJoint, createSkeletonJoint} from '../../../skeleton/joint.ts'

/** 关节 ↔ three Group 绑定 */
export interface GroupJointBinding {
    readonly jointId: string
    readonly group: Group
}

/**
 * 桥接骨架（**领域 FK 缓存为唯一世界变换源**）：
 * - updateWorldTransforms 后把局部 pose（含骨骼 roll 折算）写回 three Group，场景图级联生效；
 * - getWorldPosition/getWorldRotation 读领域缓存；
 * - syncFromScene 用于初始化或外部直接修改 Group 后把场景局部读回领域（会剔除 roll 避免重复叠加）。
 */
export interface SkeletonSceneBridge extends Skeleton {
    syncFromScene: () => void
}

export interface SkeletonBridgeOptions {
    /**
     * 根关节位移是否由外部管理（角色为 true：body 位置经 syncPositions 写入）：
     * true = 根 Group 位置为真源、动画只写旋转；false（默认）= 根位移动画生效并写回 Group。
     */
    readonly rootTranslationExternallyManaged?: boolean
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
    options?: SkeletonBridgeOptions,
): SkeletonSceneBridge => {
    const rootExternallyManaged = options?.rootTranslationExternallyManaged === true
    const groupByJointId = new Map<string, Group>()
    const bindingByGroup = new Map<Group, GroupJointBinding>()
    for (const binding of bindings) {
        if (groupByJointId.has(binding.jointId)) {
            throw new Error(`createSkeletonFromGroups 失败：关节 id 重复（${binding.jointId}）`)
        }
        groupByJointId.set(binding.jointId, binding.group)
        bindingByGroup.set(binding.group, binding)
    }

    /** 把局部 pose 写回 Group：局部旋转由世界缓存折算（含 roll 的 tail 关节），保证渲染与查询一致 */
    const writeBackToGroups = (): void => {
        for (const [jointId, group] of groupByJointId) {
            const joint = skeleton.findJoint(jointId)
            if (joint === undefined) continue
            if (joint.parent === undefined) {
                if (rootExternallyManaged) {
                    /* 根位移以场景为真源（角色：body 位置经 syncPositions 写入）——从 Group 读回保持一致 */
                    joint.position.copy(group.position)
                } else {
                    group.position.copy(joint.position)
                }
                group.quaternion.copy(joint.rotation)
                continue
            }
            group.position.copy(joint.position)
            const parentWorld = skeleton.getWorldRotation(joint.parent.id)
            const world = skeleton.getWorldRotation(jointId)
            if (parentWorld !== undefined && world !== undefined) {
                group.quaternion.copy(parentWorld.clone().invert().multiply(world))
            } else {
                group.quaternion.copy(joint.rotation)
            }
        }
    }

    const skeletonOptions: SkeletonOptions = {
        onWorldUpdate: writeBackToGroups,
        rootTranslationExternallyManaged: rootExternallyManaged,
    }
    const skeleton = createSkeleton(skeletonOptions)
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

    /** 从 Group 读回局部（初始化/外部修改后调用）；tail 关节的 roll 从读回旋转中剔除，避免 FK 重复叠加 */
    const stripRollFromTail = (): void => {
        for (const bone of skeleton.bones.values()) {
            if (bone.roll === 0) continue
            const tailGroup = groupByJointId.get(bone.tail.id)
            const headGroup = groupByJointId.get(bone.head.id)
            if (tailGroup === undefined || headGroup === undefined) continue
            tailGroup.updateWorldMatrix(true, false)
            headGroup.updateWorldMatrix(true, false)
            const headPos = headGroup.getWorldPosition(new Vector3())
            const tailPos = tailGroup.getWorldPosition(new Vector3())
            const axis = tailPos.sub(headPos)
            if (axis.lengthSq() < 1e-12) continue
            const rollWorld = new Quaternion().setFromAxisAngle(axis.normalize(), bone.roll)
            const parentWorld = tailGroup.parent !== null
                ? tailGroup.parent.getWorldQuaternion(new Quaternion())
                : new Quaternion()
            /* Group 局部旋转 = rollLocal · joint.rotation（rollLocal = parentWorld⁻¹·rollWorld·parentWorld） */
            const rollLocal = parentWorld.clone().invert().multiply(rollWorld).multiply(parentWorld)
            bone.tail.rotation.premultiply(rollLocal.invert())
        }
    }

    const syncFromScene = (): void => {
        for (const [jointId, group] of groupByJointId) {
            const joint = skeleton.findJoint(jointId)
            if (joint === undefined) continue
            joint.position.copy(group.position)
            joint.rotation.copy(group.quaternion)
        }
        stripRollFromTail()
        skeleton.updateWorldTransforms()
    }

    syncFromScene()
    return {...skeleton, syncFromScene}
}
