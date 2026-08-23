import {Vector3} from 'three'
import {IK_EPSILON} from './constants.ts'
import type {SkeletonJoint} from './joint.ts'
import type {Skeleton} from './skeleton.ts'
import {rotateJointSubtree} from './skeleton.ts'

export interface IkSolverOptions {
    readonly maxIterations: number
    readonly tolerance: number
}

/**
 * 链回溯：给定末端关节，沿其自身树的祖先链向上找第一个 ikRootLevel !== undefined 的关节作为链根；
 * 「自身树」= 从 endJoint 沿 parent 走到 undefined 为止的路径（多根骨架中仅限本树，不跨树）；
 * 路径上无 IK 根时，链根 = 该树的根关节。返回 根 → 末端 的关节数组。
 * 退化情形：链长 1（endJoint 即树根）无旋转自由度。
 */
export const resolveIkChain = (endJoint: SkeletonJoint): readonly SkeletonJoint[] => {
    const chain: SkeletonJoint[] = []
    let cursor: SkeletonJoint | undefined = endJoint
    while (cursor !== undefined) {
        chain.push(cursor)
        cursor = cursor.parent
    }
    chain.reverse()
    /* 找到链上最后一个 IK 根：从根向末端遍历，记录最新遇到的 IK 根作为链根 */
    let ikRoot: SkeletonJoint | undefined
    for (const joint of chain) {
        if (joint.ikRootLevel !== undefined) {
            ikRoot = joint
        }
    }
    if (ikRoot === undefined) return chain
    return chain.slice(chain.indexOf(ikRoot))
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
): {iterations: number; error: number} => {
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