import {Quaternion, Vector3} from 'three'
import {disconnectJoint, type SkeletonJoint} from './joint.ts'
import type {SkeletonBone} from './bone.ts'

/** 关节世界变换缓存（updateWorldTransforms 产出，只读视图） */
interface WorldTransform {
    readonly position: Vector3
    readonly rotation: Quaternion
}

/** 骨架姿态：全部关节局部 pose + 骨骼 roll（length 不参与记录） */
export interface SkeletonPose {
    readonly jointPoses: ReadonlyMap<string, {position: Vector3; rotation: Quaternion}>
    readonly boneRolls: ReadonlyMap<string, number>
}

/**
 * 骨架：关节/骨骼注册表 + FK 级联 + pose 读写。
 * 世界变换缓存由 updateWorldTransforms 显式重算：首次重算前 getWorldPosition/getWorldRotation
 * 返回 undefined；直接修改 joint.position/rotation（如编辑器拖拽）后缓存为陈旧值而非 undefined，
 * 需再次 updateWorldTransforms 刷新。返回的缓存引用调用方不得修改。
 * 操作类函数（rotateBone/setBoneLength/solveCcd 等）内部会先调用 updateWorldTransforms 保证缓存有效。
 */
export interface Skeleton {
    readonly joints: ReadonlyMap<string, SkeletonJoint>
    readonly bones: ReadonlyMap<string, SkeletonBone>
    addJoint: (joint: SkeletonJoint) => void
    /** 添加骨骼段。head 必须是 tail 的祖先；length <= 0 时按当前两端世界距离自动取值 */
    addBone: (bone: SkeletonBone) => void
    /** 移除关节：仅断开——子树独立成根（不连带删除下游）；以该关节为 head/tail 的骨骼段一并移除 */
    removeJoint: (id: string) => void
    removeBone: (id: string) => void
    findJoint: (id: string) => SkeletonJoint | undefined
    findBone: (id: string) => SkeletonBone | undefined
    /** 无父关节的根关节集合（FK 起点） */
    getRoots: () => readonly SkeletonJoint[]
    /** FK 级联：从根出发深度优先，world = parentWorld × local（先旋后移），并应用骨骼 roll 绕段轴扭转 */
    updateWorldTransforms: () => void
    getWorldPosition: (jointId: string) => Vector3 | undefined
    getWorldRotation: (jointId: string) => Quaternion | undefined
    /** 批量应用局部 pose + 骨骼 roll（动画播放写入），随后重算世界变换 */
    applyPose: (pose: SkeletonPose) => void
    /** 读取全部关节局部 pose 与骨骼 roll（编辑器记录关键帧用，值为克隆） */
    readPose: () => SkeletonPose
}

export interface SkeletonOptions {
    /** 每次 updateWorldTransforms 完成后回调（桥接场景用于把局部 pose 写回 three Group） */
    readonly onWorldUpdate?: () => void
}

export const createSkeleton = (options?: SkeletonOptions): Skeleton => {
    const joints = new Map<string, SkeletonJoint>()
    const bones = new Map<string, SkeletonBone>()
    const world = new Map<string, WorldTransform>()

    const addJoint = (joint: SkeletonJoint): void => {
        if (joints.has(joint.id)) {
            throw new Error(`addJoint 失败：关节 id 重复（${joint.id}）`)
        }
        joints.set(joint.id, joint)
    }

    const assertBoneJointRegistered = (bone: SkeletonBone): void => {
        if (!joints.has(bone.head.id) || !joints.has(bone.tail.id)) {
            throw new Error(`addBone 失败：骨骼 "${bone.name}" 的关节未注册到本骨架`)
        }
    }

    const assertHeadAncestorOfTail = (bone: SkeletonBone): void => {
        let cursor: SkeletonJoint | undefined = bone.tail.parent
        while (cursor !== undefined) {
            if (cursor === bone.head) return
            cursor = cursor.parent
        }
        throw new Error(`addBone 失败：骨骼 "${bone.name}" 的 head 不是 tail 的祖先`)
    }

    const addBone = (bone: SkeletonBone): void => {
        if (bones.has(bone.id)) {
            throw new Error(`addBone 失败：骨骼 id 重复（${bone.id}）`)
        }
        assertBoneJointRegistered(bone)
        assertHeadAncestorOfTail(bone)
        if (bone.length <= 0) {
            updateWorldTransforms()
            const headPos = world.get(bone.head.id)?.position
            const tailPos = world.get(bone.tail.id)?.position
            bone.length = headPos !== undefined && tailPos !== undefined
                ? headPos.distanceTo(tailPos)
                : 0
        }
        bones.set(bone.id, bone)
    }

    const removeJoint = (id: string): void => {
        const joint = joints.get(id)
        if (joint === undefined) return
        disconnectJoint(joint)
        /* 断开直接子关节并把其局部坐标换算为世界坐标（子树独立成根且世界变换不变）；
         * 注：子关节若为骨骼 tail 且带 roll，重根后 roll 会重复应用（罕见场景，暂不处理） */
        updateWorldTransforms()
        for (const child of [...joint.children]) {
            disconnectJoint(child)
            const worldPos = world.get(child.id)?.position
            const worldRot = world.get(child.id)?.rotation
            if (worldPos !== undefined) child.position.copy(worldPos)
            if (worldRot !== undefined) child.rotation.copy(worldRot)
        }
        for (const [boneId, bone] of bones) {
            if (bone.head === joint || bone.tail === joint) {
                bones.delete(boneId)
            }
        }
        joints.delete(id)
    }

    const removeBone = (id: string): void => {
        bones.delete(id)
    }

    /** 收集骨骼 roll 旋转：joint 是某骨骼 tail 时返回绕段轴的四元数（roll ≠ 0）。
 *  tailWorldPos 为 joint 本次 FK 计算出的世界位置（尚未入缓存） */
    const rollQuatFor = (joint: SkeletonJoint, tailWorldPos: Vector3, out: Quaternion): Quaternion | undefined => {
        for (const bone of bones.values()) {
            if (bone.tail !== joint || bone.roll === 0) continue
            const headPos = world.get(bone.head.id)?.position
            if (headPos === undefined) continue
            const axis = tailWorldPos.clone().sub(headPos)
            if (axis.lengthSq() < 1e-12) continue
            return out.setFromAxisAngle(axis.normalize(), bone.roll)
        }
        return undefined
    }

    const dfs = (joint: SkeletonJoint, parentPos: Vector3, parentRot: Quaternion): void => {
        const worldPos = joint.position.clone().applyQuaternion(parentRot).add(parentPos)
        let worldRot = parentRot.clone().multiply(joint.rotation)
        const rollQuat = rollQuatFor(joint, worldPos, new Quaternion())
        if (rollQuat !== undefined) {
            worldRot = rollQuat.multiply(worldRot)
        }
        world.set(joint.id, {position: worldPos, rotation: worldRot})
        for (const child of joint.children) {
            dfs(child, worldPos, worldRot)
        }
    }

    const updateWorldTransforms = (): void => {
        world.clear()
        const identity = new Quaternion()
        const origin = new Vector3()
        for (const joint of joints.values()) {
            if (joint.parent === undefined) {
                dfs(joint, origin, identity)
            }
        }
        options?.onWorldUpdate?.()
    }

    const getWorldPosition = (jointId: string): Vector3 | undefined => world.get(jointId)?.position

    const getWorldRotation = (jointId: string): Quaternion | undefined => world.get(jointId)?.rotation

    const applyPose = (pose: SkeletonPose): void => {
        for (const [jointId, jointPose] of pose.jointPoses) {
            const joint = joints.get(jointId)
            if (joint === undefined) continue
            if (joint.parent === undefined) {
                /* 根关节位移由外部管理（角色桥接：body 位置经 syncPositions 写入），
                 * 动画只驱动旋转 —— 避免 clip 把根位置写为原点导致模型飞回坐标原点 */
                joint.rotation.copy(jointPose.rotation)
            } else {
                joint.position.copy(jointPose.position)
                joint.rotation.copy(jointPose.rotation)
            }
        }
        for (const [id, roll] of pose.boneRolls) {
            const bone = bones.get(id)
            if (bone === undefined) continue
            bone.roll = roll
        }
        updateWorldTransforms()
    }

    const readPose = (): SkeletonPose => {
        const jointPoses = new Map<string, {position: Vector3; rotation: Quaternion}>()
        for (const joint of joints.values()) {
            jointPoses.set(joint.id, {
                position: joint.position.clone(),
                rotation: joint.rotation.clone(),
            })
        }
        const boneRolls = new Map<string, number>()
        for (const bone of bones.values()) {
            boneRolls.set(bone.id, bone.roll)
        }
        return {jointPoses, boneRolls}
    }

    return {
        get joints() { return joints },
        get bones() { return bones },
        addJoint,
        addBone,
        removeJoint,
        removeBone,
        findJoint: (id) => joints.get(id),
        findBone: (id) => bones.get(id),
        getRoots: () => [...joints.values()].filter(j => j.parent === undefined),
        updateWorldTransforms,
        getWorldPosition,
        getWorldRotation,
        applyPose,
        readPose,
    }
}

/**
 * 以 pivotWorld 为轴心刚体旋转 target 子树（含 target 自身）：
 * 子树各关节新世界变换 = R·(旧 − pivot) + pivot（旋转部分 = R·旧旋转），
 * 写入局部后重算世界（roll 重新应用，结果一致）。
 * 要求目标关节及其父链的世界缓存已更新（调用方先 updateWorldTransforms）。
 */
export const rotateJointSubtree = (
    skeleton: Skeleton,
    target: SkeletonJoint,
    pivotWorld: Vector3,
    axis: Vector3,
    angle: number,
): void => {
    const subtree = collectSubtree(target)
    const rotation = new Quaternion().setFromAxisAngle(axis, angle)
    const newWorld = new Map<string, WorldTransform>()

    for (const joint of subtree) {
        const old = worldTransformOf(skeleton, joint)
        if (old === undefined) continue
        const newPos = old.position.clone().sub(pivotWorld).applyQuaternion(rotation).add(pivotWorld)
        const newRot = rotation.clone().multiply(old.rotation)
        newWorld.set(joint.id, {position: newPos, rotation: newRot})
    }

    writeLocalsFromWorld(skeleton, subtree, newWorld)
    skeleton.updateWorldTransforms()
}

/** 整体平移 target 子树（含 target 自身）delta 向量，写入局部后重算世界 */
export const translateJointSubtree = (
    skeleton: Skeleton,
    target: SkeletonJoint,
    delta: Vector3,
): void => {
    const subtree = collectSubtree(target)
    const newWorld = new Map<string, WorldTransform>()

    for (const joint of subtree) {
        const old = worldTransformOf(skeleton, joint)
        if (old === undefined) continue
        newWorld.set(joint.id, {
            position: old.position.clone().add(delta),
            rotation: old.rotation.clone(),
        })
    }

    writeLocalsFromWorld(skeleton, subtree, newWorld)
    skeleton.updateWorldTransforms()
}

/** 级联编辑设置（编辑器面板可变的共享对象）：
 *  enabled = 是否级联调整子节点；depth = 级联层数（1 = 仅直接子节点跟随） */
export interface JointCascadeSettings {
    enabled: boolean
    depth: number
}

/** 收集 joint 子树中级联范围之外的后代（层级 > depth，需保持世界变换的节点）；
 *  depth = 0 时收集全部后代（级联关闭：仅本节点变化） */
const collectDescendantsBeyondDepth = (joint: SkeletonJoint, depth: number): readonly SkeletonJoint[] => {
    const out: SkeletonJoint[] = []
    const visit = (node: SkeletonJoint, level: number): void => {
        for (const child of node.children) {
            if (level > depth) out.push(child)
            visit(child, level + 1)
        }
    }
    visit(joint, 1)
    return out
}

/** 记录一组关节的当前世界变换（级联编辑前快照，值为克隆） */
const snapshotWorldTransforms = (
    skeleton: Skeleton,
    joints: readonly SkeletonJoint[],
): Map<string, {position: Vector3; rotation: Quaternion}> => {
    const before = new Map<string, {position: Vector3; rotation: Quaternion}>()
    for (const joint of joints) {
        const pos = skeleton.getWorldPosition(joint.id)
        const rot = skeleton.getWorldRotation(joint.id)
        if (pos !== undefined && rot !== undefined) {
            before.set(joint.id, {position: pos.clone(), rotation: rot.clone()})
        }
    }
    return before
}

/** 把 joints 的世界变换恢复为 before 记录值（写回局部后重算世界变换，
 *  父节点世界优先取 newWorld（同批恢复的节点），否则取当前缓存（跟随编辑的节点）） */
const restoreWorldTransforms = (
    skeleton: Skeleton,
    joints: readonly SkeletonJoint[],
    before: ReadonlyMap<string, {position: Vector3; rotation: Quaternion}>,
): void => {
    const newWorld = new Map<string, WorldTransform>()
    for (const joint of joints) {
        const b = before.get(joint.id)
        if (b === undefined) continue
        newWorld.set(joint.id, {position: b.position.clone(), rotation: b.rotation.clone()})
    }
    writeLocalsFromWorld(skeleton, joints, newWorld)
    skeleton.updateWorldTransforms()
}

/**
 * 级联平移：按设置移动 joint（世界位移 delta）。
 * 级联层数内的后代随 FK 刚体跟随，层数外的后代保持原世界变换（链在级联边界处断开）。
 * settings.enabled = false 时仅本关节变化（等价 depth 0）。
 */
export const translateJointCascade = (
    skeleton: Skeleton,
    joint: SkeletonJoint,
    delta: Vector3,
    settings: JointCascadeSettings,
): void => {
    skeleton.updateWorldTransforms()
    const restore = collectDescendantsBeyondDepth(joint, settings.enabled ? settings.depth : 0)
    const before = snapshotWorldTransforms(skeleton, restore)
    const parent = joint.parent
    if (parent === undefined) {
        joint.position.add(delta)
    } else {
        const parentRot = skeleton.getWorldRotation(parent.id)
        if (parentRot !== undefined) {
            joint.position.add(delta.clone().applyQuaternion(parentRot.clone().invert()))
        }
    }
    skeleton.updateWorldTransforms()
    restoreWorldTransforms(skeleton, restore, before)
}

/**
 * 级联旋转：绕 joint 自身世界位置施加世界旋转（预乘语义）。
 * 级联层数内的后代随 FK 刚体旋转，层数外的后代保持原世界变换。
 * settings.enabled = false 时仅本关节旋转（等价 depth 0）。
 */
export const rotateJointCascade = (
    skeleton: Skeleton,
    joint: SkeletonJoint,
    rotation: Quaternion,
    settings: JointCascadeSettings,
): void => {
    skeleton.updateWorldTransforms()
    const restore = collectDescendantsBeyondDepth(joint, settings.enabled ? settings.depth : 0)
    const before = snapshotWorldTransforms(skeleton, restore)
    const parent = joint.parent
    const parentRot = parent !== undefined ? skeleton.getWorldRotation(parent.id) : undefined
    /* 世界预乘旋转 → 关节局部：localQ = parent⁻¹ · Q · parent（父旋转共轭） */
    const localQ = parentRot !== undefined
        ? parentRot.clone().invert().multiply(rotation).multiply(parentRot)
        : rotation.clone()
    joint.rotation.premultiply(localQ)
    skeleton.updateWorldTransforms()
    restoreWorldTransforms(skeleton, restore, before)
}

/** 收集 target 的全部后代（含自身），父先子后（DFS） */
const collectSubtree = (target: SkeletonJoint): readonly SkeletonJoint[] => {
    const out: SkeletonJoint[] = []
    const visit = (joint: SkeletonJoint): void => {
        out.push(joint)
        for (const child of joint.children) visit(child)
    }
    visit(target)
    return out
}

/** 读取关节当前世界变换（缓存），未更新时返回 undefined */
const worldTransformOf = (skeleton: Skeleton, joint: SkeletonJoint): WorldTransform | undefined => {
    const pos = skeleton.getWorldPosition(joint.id)
    const rot = skeleton.getWorldRotation(joint.id)
    return pos !== undefined && rot !== undefined ? {position: pos, rotation: rot} : undefined
}

/** 将子树关节的新世界变换写回局部 pose：parent 世界优先取 newWorld，否则取缓存 */
const writeLocalsFromWorld = (
    skeleton: Skeleton,
    subtree: readonly SkeletonJoint[],
    newWorld: ReadonlyMap<string, WorldTransform>,
): void => {
    for (const joint of subtree) {
        const target = newWorld.get(joint.id)
        if (target === undefined) continue
        const parent = joint.parent
        if (parent === undefined) {
            joint.position.copy(target.position)
            joint.rotation.copy(target.rotation)
            continue
        }
        const parentWorld = newWorld.get(parent.id) ?? worldTransformOf(skeleton, parent)
        if (parentWorld === undefined) continue
        const invParentRot = parentWorld.rotation.clone().invert()
        joint.position.copy(target.position.clone().sub(parentWorld.position).applyQuaternion(invParentRot))
        joint.rotation.copy(invParentRot.clone().multiply(target.rotation))
    }
}