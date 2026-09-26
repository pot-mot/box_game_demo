import {Vector3, type Object3D} from 'three'
import type {Skeleton} from '../../../skeleton/skeleton.ts'
import {resolveIkChain, solveCcd} from '../../../skeleton/ik.ts'
import {DEFAULT_IK_MAX_ITERATIONS, DEFAULT_IK_TOLERANCE} from '../../../skeleton/constants.ts'

/**
 * 双手共持 IK（生产角色与骨骼编辑器共用）：
 * 左肩为 IK 根，左手链末端被求解到武器轴上的副握点，使左手真正「握住」武器。
 *
 * - 末端关节解析（`leftGripJointId`）兼容生产（只有 `leftHandPivot`）、
 *   预设/编辑器（`leftWristPivot` + `leftWeaponMount`）与自定义骨架；
 * - 副握点优先取武器本地 +Y（握把→刃尖）偏移，无武器 Group 时回退「右腕 + 右肘方向 × offset」。
 */

/** 左手链末端候选（按优先级）：左手武器挂点 → 左腕 → 左手 */
const LEFT_GRIP_JOINT_CANDIDATES = ['leftWeaponMount', 'leftWristPivot', 'leftHandPivot'] as const

/** 左手链末端关节 id：按候选优先级取首个存在的关节（都不存在时回退左手） */
export const leftGripJointId = (skeleton: Skeleton): string =>
    LEFT_GRIP_JOINT_CANDIDATES.find(id => skeleton.findJoint(id) !== undefined) ?? 'leftHandPivot'

/**
 * 副握点世界坐标（写入 out）：
 * - 有武器 Group → 武器本地 +Y 偏移 offset（沿武器轴，握把→刃尖）；
 * - 无武器 Group → 右腕 + （右肘 − 右腕）方向 × offset（生产回退）。
 * 返回 undefined 表示骨架缺少所需关节。
 */
export const computeTwoHandGripTarget = (
    skeleton: Skeleton,
    weaponGroup: Object3D | undefined,
    offset: number,
    out: Vector3,
): Vector3 | undefined => {
    if (weaponGroup !== undefined) {
        /* 更新祖先与自身的世界矩阵：姿态刚写回 Group，matrixWorld 可能尚未刷新 */
        weaponGroup.updateWorldMatrix(true, false)
        return out.set(0, offset, 0).applyMatrix4(weaponGroup.matrixWorld)
    }
    const wristWorld = skeleton.getWorldPosition('rightWristPivot') ?? skeleton.getWorldPosition('rightHandPivot')
    const elbowWorld = skeleton.getWorldPosition('rightArmElbow')
    if (wristWorld === undefined || elbowWorld === undefined) return undefined
    return out.copy(wristWorld).add(elbowWorld.clone().sub(wristWorld).normalize().multiplyScalar(offset))
}

export interface TwoHandGripOptions {
    /** IK 根（肩）关节 id，默认 `leftArmShoulder` */
    readonly shoulderId?: string
    /** 副握点沿武器轴的偏移（米） */
    readonly offset: number
    readonly maxIterations?: number
    readonly tolerance?: number
}

/**
 * 求解双手共持：设左肩为 IK 根，左手链 CCD 追副握点；目标超出臂展时按臂展截断。
 * 返回 false 表示缺少关节/武器或无旋转自由度，未做任何约束。
 */
export const solveTwoHandedGrip = (
    skeleton: Skeleton,
    weaponGroup: Object3D | undefined,
    options: TwoHandGripOptions,
): boolean => {
    const shoulderId = options.shoulderId ?? 'leftArmShoulder'
    const shoulder = skeleton.findJoint(shoulderId)
    const endJoint = skeleton.findJoint(leftGripJointId(skeleton))
    if (shoulder === undefined || endJoint === undefined) return false

    skeleton.updateWorldTransforms()
    const target = new Vector3()
    if (computeTwoHandGripTarget(skeleton, weaponGroup, options.offset, target) === undefined) return false

    shoulder.ikRootLevel = 0
    const chain = resolveIkChain(endJoint)
    if (chain.length <= 1) return false

    /* 目标超出臂展（链长之和）时按臂展截断：避免不可达目标把左臂拉直穿模 */
    const shoulderWorld = skeleton.getWorldPosition(shoulderId)
    if (shoulderWorld !== undefined) {
        const reach = chain.slice(1).reduce((sum, joint) => sum + joint.position.length(), 0)
        const offsetVec = target.clone().sub(shoulderWorld)
        if (reach > 0 && offsetVec.length() > reach) {
            target.copy(shoulderWorld).add(offsetVec.setLength(reach))
        }
    }

    solveCcd(skeleton, chain, target, {
        maxIterations: options.maxIterations ?? DEFAULT_IK_MAX_ITERATIONS,
        tolerance: options.tolerance ?? DEFAULT_IK_TOLERANCE,
    })
    skeleton.updateWorldTransforms()
    return true
}

/** 清除左手 IK 根（贴合关闭/卸下武器后回到由 clip 驱动的左臂姿态） */
export const clearTwoHandGripRoot = (skeleton: Skeleton, shoulderId = 'leftArmShoulder'): void => {
    const shoulder = skeleton.findJoint(shoulderId)
    if (shoulder !== undefined) shoulder.ikRootLevel = undefined
}
