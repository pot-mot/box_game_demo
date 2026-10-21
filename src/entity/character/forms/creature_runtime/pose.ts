import {Euler, Quaternion, Vector3} from 'three'
import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import {bakeClip, type BakedJointPose} from '../../../../skeleton/anim/bake.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'

/** 带位置的关节姿态（位置为关节局部绝对坐标；缺省沿用骨架静止位置） */
export interface JointPoseWithPosition {
    readonly rotation: readonly [number, number, number]
    readonly position: readonly [number, number, number]
}

/** 单关节姿态：只转（三元组）或旋转 + 位置 */
export type JointPose = readonly [number, number, number] | JointPoseWithPosition

/** 关节 id → 姿态；未列出的关节用骨架静止姿态 */
export type JointEulers = Readonly<Record<string, JointPose>>

/** 逐帧姿态函数（t 秒，total 为 clip 总时长） */
export type PoseFunction = (t: number, total: number) => JointEulers

/** 是否为带位置的关节姿态 */
export const isPoseWithPosition = (pose: JointPose): pose is JointPoseWithPosition =>
    !Array.isArray(pose)

/** 生成带位置的姿态（简写） */
export const poseAt = (
    rotation: readonly [number, number, number],
    position: readonly [number, number, number],
): JointPoseWithPosition => ({rotation, position})

/**
 * 体形姿态烘焙：把逐帧姿态函数按骨架静止位置烘焙为 clip。
 * - 只给旋转时位置沿用骨架静止值；
 * - 给 `poseAt(rotation, position)` 时可动画该关节位置（躯干起伏、翼爪抬落等）；
 * - **未声明的关节显式写入骨架静止姿态**：攻击 / 基础 clip 必须是完整姿态，
 *   否则切换段时会沿用上一段的关节值（表现为「部分骨骼丢失 / 卡在旧动作」）；
 * - `preserveJointIds` 中的关节保持当前姿态（用于口部等**不参与动画**的武器挂点，
 *   其朝向由 `equipWeapon` 的 `mountRotation` 决定，不能被静止姿态覆盖）。
 */
export const bakePoseClip = (
    name: string,
    duration: number,
    loop: boolean,
    skeleton: SkeletonDefinition,
    poseFn: PoseFunction,
    preserveJointIds: readonly string[] = [],
    fps?: number,
): BoneAnimationClip => {
    const jointIds = skeleton.joints.map(joint => joint.id)
    const preserved = new Set(preserveJointIds)
    const rest = new Map<string, BakedJointPose>(skeleton.joints.map(joint => [joint.id, {
        position: new Vector3().fromArray([...joint.position]),
        rotation: new Quaternion().fromArray([...joint.rotation]),
    }]))
    return bakeClip(name, duration, loop, jointIds, (t): ReadonlyMap<string, BakedJointPose> => {
        const poses = poseFn(t, duration)
        const map = new Map<string, BakedJointPose>()
        for (const id of jointIds) {
            const restPose = rest.get(id)
            if (restPose === undefined) continue
            const pose = poses[id]
            if (pose === undefined) {
                if (preserved.has(id)) continue
                map.set(id, {position: restPose.position.clone(), rotation: restPose.rotation.clone()})
            } else if (isPoseWithPosition(pose)) {
                const [x, y, z] = pose.position
                map.set(id, {
                    position: new Vector3(x, y, z),
                    rotation: new Quaternion().setFromEuler(new Euler(pose.rotation[0], pose.rotation[1], pose.rotation[2], 'XYZ')),
                })
            } else {
                map.set(id, {
                    position: restPose.position.clone(),
                    rotation: new Quaternion().setFromEuler(new Euler(pose[0], pose[1], pose[2], 'XYZ')),
                })
            }
        }
        return map
    }, fps)
}
