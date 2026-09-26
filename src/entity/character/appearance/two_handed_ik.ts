import {Matrix4, Vector3, type Object3D} from 'three'
import {rotateJointSubtree, type Skeleton} from '../../../skeleton/skeleton.ts'
import type {SkeletonJoint} from '../../../skeleton/joint.ts'
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

/** 根对象世界矩阵的逆（换算回骨架空间用；模块级复用避免逐帧分配） */
const _rootInverse = new Matrix4()

/**
 * 副握点坐标（写入 out）：
 * - 有武器 Group → 武器模型原点沿本地 +Y 偏移 offset（沿武器轴，握把→刃尖）；
 *   调用方传武器模型原点对齐主握把后的副握距离；
 * - 无武器 Group → 右腕 + （右肘 − 右腕）方向 × offset（生产回退）。
 *
 * `rootObject` = 骨架根对应的场景对象（角色为 `model.group`）：传入时把世界目标换算回
 * **骨架空间**（未缩放、未旋转）——领域骨架 FK 不含根 Group 的缩放，而武器 `matrixWorld`
 * 含缩放（展示模式 `ACTOR_SCALE = 1.3`），不换算会让 IK 目标与臂展分属两个空间。
 * 返回 undefined 表示骨架缺少所需关节。
 */
export const computeTwoHandGripTarget = (
    skeleton: Skeleton,
    weaponGroup: Object3D | undefined,
    offset: number,
    out: Vector3,
    rootObject?: Object3D,
): Vector3 | undefined => {
    if (weaponGroup !== undefined) {
        /* 更新祖先与自身的世界矩阵：姿态刚写回 Group，matrixWorld 可能尚未刷新 */
        weaponGroup.updateWorldMatrix(true, false)
        out.set(0, offset, 0).applyMatrix4(weaponGroup.matrixWorld)
        if (rootObject !== undefined) {
            /* 世界 → 根 Group 局部（去掉根缩放/旋转）：得到骨架根关节系内的链坐标 */
            out.applyMatrix4(_rootInverse.copy(rootObject.matrixWorld).invert())
            /* 局部 → 骨架世界系：领域骨架的根关节带自身世界位置/旋转，需补回 */
            const root = skeleton.getRoots()[0]
            const rootPos = root !== undefined ? skeleton.getWorldPosition(root.id) : undefined
            const rootRot = root !== undefined ? skeleton.getWorldRotation(root.id) : undefined
            if (rootPos !== undefined && rootRot !== undefined) {
                out.applyQuaternion(rootRot).add(rootPos)
            }
        }
        return out
    }
    const wristWorld = skeleton.getWorldPosition('rightWristPivot') ?? skeleton.getWorldPosition('rightHandPivot')
    const elbowWorld = skeleton.getWorldPosition('rightArmElbow')
    if (wristWorld === undefined || elbowWorld === undefined) return undefined
    return out.copy(wristWorld).add(elbowWorld.clone().sub(wristWorld).normalize().multiplyScalar(offset))
}

/* 肘极向模块级临时向量（避免每帧分配） */
const _poleAxis = new Vector3()
const _elbowPerp = new Vector3()
const _polePerp = new Vector3()
const _poleCross = new Vector3()

/**
 * 肘极向约束：绕「肩→手」轴旋转整条手臂，把中间关节（肘）摆到 `poleWorld` 在该轴垂直平面内的方向。
 * 手位于轴上，旋转不改变其位置；只消除 CCD 收敛出的反关节（肘向后折）。
 */
const applyElbowPole = (
    skeleton: Skeleton,
    shoulderJoint: SkeletonJoint,
    elbowJoint: SkeletonJoint,
    endJoint: SkeletonJoint,
    poleWorld: Vector3,
): void => {
    const shoulderWorld = skeleton.getWorldPosition(shoulderJoint.id)
    const endWorld = skeleton.getWorldPosition(endJoint.id)
    const elbowWorld = skeleton.getWorldPosition(elbowJoint.id)
    if (shoulderWorld === undefined || endWorld === undefined || elbowWorld === undefined) return
    _poleAxis.subVectors(endWorld, shoulderWorld)
    if (_poleAxis.lengthSq() < 1e-10) return
    _poleAxis.normalize()
    _elbowPerp.subVectors(elbowWorld, shoulderWorld)
    _elbowPerp.addScaledVector(_poleAxis, -_elbowPerp.dot(_poleAxis))
    _polePerp.copy(poleWorld)
    _polePerp.addScaledVector(_poleAxis, -_polePerp.dot(_poleAxis))
    if (_elbowPerp.lengthSq() < 1e-10 || _polePerp.lengthSq() < 1e-10) return
    _elbowPerp.normalize()
    _polePerp.normalize()
    const cos = Math.min(1, Math.max(-1, _elbowPerp.dot(_polePerp)))
    const sin = _poleAxis.dot(_poleCross.crossVectors(_elbowPerp, _polePerp))
    const angle = Math.atan2(sin, cos)
    if (Math.abs(angle) < 1e-6) return
    rotateJointSubtree(skeleton, shoulderJoint, shoulderWorld, _poleAxis, angle)
}

export interface TwoHandGripOptions {
    /** IK 根（肩）关节 id，默认 `leftArmShoulder` */
    readonly shoulderId?: string
    /** 副握点沿武器轴的偏移（米） */
    readonly offset: number
    /** 骨架根对应的场景对象（角色为 `model.group`；传入后目标换算回骨架空间，见 `computeTwoHandGripTarget`） */
    readonly rootObject?: Object3D
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
    if (computeTwoHandGripTarget(skeleton, weaponGroup, options.offset, target, options.rootObject) === undefined) return false

    shoulder.ikRootLevel = 0
    const chain = resolveIkChain(endJoint)
    if (chain.length <= 1) return false

    /* 目标超出臂展（链长之和）时按臂展截断：避免不可达目标把左臂拉直穿模。
     * 臂展必须在世界空间按「相邻关节间距」累加：局部 position.length() 不含模型 scale，
     * 展示模式等缩放模型（ACTOR_SCALE = 1.3）下会低估臂展，把左手截停在武器之外 */
    const shoulderWorld = skeleton.getWorldPosition(shoulderId)
    if (shoulderWorld !== undefined) {
        let reach = 0
        for (let i = 1; i < chain.length; i++) {
            const from = skeleton.getWorldPosition(chain[i - 1].id)
            const to = skeleton.getWorldPosition(chain[i].id)
            if (from !== undefined && to !== undefined) reach += from.distanceTo(to)
        }
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

    /* 肘极向：把左肘摆到「下 + 角色外侧」，消除反关节（远程武器/恢复段尤其明显） */
    if (chain.length >= 3) {
        const poleWorld = new Vector3(0, -1, 0)
        const leftShoulder = skeleton.getWorldPosition(shoulderId)
        const rightShoulder = skeleton.getWorldPosition('rightArmShoulder')
        if (leftShoulder !== undefined && rightShoulder !== undefined) {
            const outward = leftShoulder.clone().sub(rightShoulder)
            if (outward.lengthSq() > 1e-8) poleWorld.addScaledVector(outward.normalize(), 0.5).normalize()
        }
        applyElbowPole(skeleton, chain[0], chain[1], chain[chain.length - 1], poleWorld)
        skeleton.updateWorldTransforms()
    }
    return true
}

/** 清除左手 IK 根（贴合关闭/卸下武器后回到由 clip 驱动的左臂姿态） */
export const clearTwoHandGripRoot = (skeleton: Skeleton, shoulderId = 'leftArmShoulder'): void => {
    const shoulder = skeleton.findJoint(shoulderId)
    if (shoulder !== undefined) shoulder.ikRootLevel = undefined
}
