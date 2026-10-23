import {Vector3} from 'three'
import {DEFAULT_IK_CHAIN_DEPTH, IK_EPSILON} from './constants.ts'
import type {IkSolverId, SkeletonJoint} from './joint.ts'
import type {Skeleton} from './skeleton.ts'
import {rotateJointSubtree} from './skeleton.ts'

export interface IkSolverOptions {
    readonly maxIterations: number
    readonly tolerance: number
}

export interface IkSolveResult {
    readonly iterations: number
    readonly error: number
}

/**
 * 以 endJoint 为末端向上取 chainDepth 个父级，返回 根 → 末端 的关节数组。
 * 父级不足时截断到该树根；chainDepth < 1 时按 1 处理。
 */
export const resolveIkChain = (
    endJoint: SkeletonJoint,
    chainDepth = DEFAULT_IK_CHAIN_DEPTH,
): readonly SkeletonJoint[] => {
    const depth = Math.max(1, Math.floor(chainDepth))
    const chain: SkeletonJoint[] = [endJoint]
    let cursor = endJoint.parent
    for (let level = 0; level < depth && cursor !== undefined; level++) {
        chain.push(cursor)
        cursor = cursor.parent
    }
    return chain.reverse()
}

/** 构建 root → end 的显式链（要求 root 是 end 的祖先；不满足时返回空数组） */
export const collectChainBetween = (
    root: SkeletonJoint,
    end: SkeletonJoint,
): readonly SkeletonJoint[] => {
    const chain: SkeletonJoint[] = []
    let cursor: SkeletonJoint | undefined = end
    while (cursor !== undefined) {
        chain.push(cursor)
        if (cursor === root) return chain.reverse()
        cursor = cursor.parent
    }
    return []
}

/**
 * CCD 求解：从末端前一关节向根迭代，每次将关节的 tail 子树刚体旋转，
 * 使「末端→当前关节」方向对齐「目标→当前关节」方向；收敛条件 error < tolerance 或达 maxIterations。
 * 直接写入链上关节的局部 rotation。退化链（长度 <= 1）不修改姿态。
 */
export const solveCcd = (
    skeleton: Skeleton,
    chain: readonly SkeletonJoint[],
    target: Vector3,
    options: IkSolverOptions,
): IkSolveResult => {
    skeleton.updateWorldTransforms()
    if (chain.length <= 1) {
        const endPos = skeleton.getWorldPosition(chain[0].id)
        return {iterations: 0, error: endPos !== undefined ? endPos.distanceTo(target) : Number.POSITIVE_INFINITY}
    }

    const end = chain[chain.length - 1]
    let iterations = 0

    for (let iter = 1; iter <= options.maxIterations; iter++) {
        iterations = iter
        let endPos = skeleton.getWorldPosition(end.id)
        if (endPos === undefined) break

        for (let i = chain.length - 2; i >= 0; i--) {
            const joint = chain[i]
            const jointPos = skeleton.getWorldPosition(joint.id)
            if (jointPos === undefined) continue
            const toEnd = endPos.clone().sub(jointPos)
            const toTarget = target.clone().sub(jointPos)
            if (toEnd.lengthSq() < IK_EPSILON || toTarget.lengthSq() < IK_EPSILON) continue
            toEnd.normalize()
            toTarget.normalize()
            /* 注意：cross 会原地改写 toEnd，cos 必须先于 cross 计算 */
            const cos = toEnd.dot(toTarget)
            const axis = toEnd.cross(toTarget)
            const sin = axis.length()
            if (sin < IK_EPSILON) continue
            const angle = Math.atan2(sin, cos)
            rotateJointSubtree(skeleton, joint, jointPos, axis.normalize(), angle)
            const updatedEnd = skeleton.getWorldPosition(end.id)
            if (updatedEnd === undefined) break
            endPos = updatedEnd
        }

        const error = endPos.distanceTo(target)
        if (error < options.tolerance) break
    }

    const finalEnd = skeleton.getWorldPosition(end.id)
    return {
        iterations,
        error: finalEnd !== undefined ? finalEnd.distanceTo(target) : Number.POSITIVE_INFINITY,
    }
}

/**
 * FABRIK 求解：先在位置空间做后向/前向迭代，收敛后再逐段把方向变化写回关节旋转。
 * 位置迭代不改变根关节位置；回写旋转时保留各段 roll/扭转。
 */
export const solveFabrik = (
    skeleton: Skeleton,
    chain: readonly SkeletonJoint[],
    target: Vector3,
    options: IkSolverOptions,
): IkSolveResult => {
    skeleton.updateWorldTransforms()
    if (chain.length <= 1) {
        const endPos = skeleton.getWorldPosition(chain[0].id)
        return {iterations: 0, error: endPos !== undefined ? endPos.distanceTo(target) : Number.POSITIVE_INFINITY}
    }

    const count = chain.length
    const positions: Vector3[] = []
    for (const joint of chain) {
        const pos = skeleton.getWorldPosition(joint.id)
        if (pos === undefined) {
            return {iterations: 0, error: Number.POSITIVE_INFINITY}
        }
        positions.push(pos.clone())
    }

    const lengths: number[] = []
    let totalReach = 0
    for (let i = 1; i < count; i++) {
        const length = positions[i].distanceTo(positions[i - 1])
        lengths.push(length)
        totalReach += length
    }

    const root = positions[0].clone()
    const targetDistance = root.distanceTo(target)
    let iterations = 0

    if (targetDistance > totalReach) {
        /* 目标不可达：把链拉成指向目标的直线 */
        const direction = target.clone().sub(root)
        if (direction.lengthSq() >= IK_EPSILON) {
            direction.normalize()
            for (let i = 1; i < count; i++) {
                positions[i].copy(positions[i - 1]).addScaledVector(direction, lengths[i - 1])
            }
        }
    } else {
        for (let iter = 1; iter <= options.maxIterations; iter++) {
            iterations = iter
            /* 后向：末端贴目标，逐段回推父节点 */
            positions[count - 1].copy(target)
            for (let i = count - 2; i >= 0; i--) {
                const direction = positions[i].clone().sub(positions[i + 1])
                const length = direction.length()
                if (length < IK_EPSILON) continue
                direction.multiplyScalar(lengths[i] / length)
                positions[i].copy(positions[i + 1]).add(direction)
            }
            /* 前向：根固定，逐段前推子节点 */
            positions[0].copy(root)
            for (let i = 1; i < count; i++) {
                const direction = positions[i].clone().sub(positions[i - 1])
                const length = direction.length()
                if (length < IK_EPSILON) continue
                direction.multiplyScalar(lengths[i - 1] / length)
                positions[i].copy(positions[i - 1]).add(direction)
            }
            if (positions[count - 1].distanceTo(target) < options.tolerance) break
        }
    }

    /* 位置解 → 局部旋转：逐段把当前段方向旋到目标段方向 */
    skeleton.updateWorldTransforms()
    for (let i = 0; i < count - 1; i++) {
        const joint = chain[i]
        const jointPos = skeleton.getWorldPosition(joint.id)
        const nextPos = skeleton.getWorldPosition(chain[i + 1].id)
        if (jointPos === undefined || nextPos === undefined) continue
        const currentDirection = nextPos.clone().sub(jointPos)
        const desiredDirection = positions[i + 1].clone().sub(positions[i])
        if (currentDirection.lengthSq() < IK_EPSILON || desiredDirection.lengthSq() < IK_EPSILON) continue
        currentDirection.normalize()
        desiredDirection.normalize()
        const cos = currentDirection.dot(desiredDirection)
        const axis = currentDirection.clone().cross(desiredDirection)
        const sin = axis.length()
        if (sin < IK_EPSILON) continue
        const angle = Math.atan2(sin, Math.max(-1, Math.min(1, cos)))
        rotateJointSubtree(skeleton, joint, jointPos, axis.normalize(), angle)
    }
    skeleton.updateWorldTransforms()

    const finalEnd = skeleton.getWorldPosition(chain[count - 1].id)
    return {
        iterations,
        error: finalEnd !== undefined ? finalEnd.distanceTo(target) : Number.POSITIVE_INFINITY,
    }
}

/** 按节点配置的求解器求解链（统一入口；仅供编辑器 Gizmo 拖拽求解，生产动画不使用运行时 IK） */
export const solveIkChain = (
    skeleton: Skeleton,
    chain: readonly SkeletonJoint[],
    target: Vector3,
    solver: IkSolverId,
    options: IkSolverOptions,
): IkSolveResult => solver === 'fabrik'
    ? solveFabrik(skeleton, chain, target, options)
    : solveCcd(skeleton, chain, target, options)
