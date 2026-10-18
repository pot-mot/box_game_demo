import {Euler, Quaternion, Vector3} from 'three'
import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import {bakeClip, type BakedJointPose} from '../../../../skeleton/anim/bake.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'

/** 单关节欧拉角（rx/ry/rz 弧度）；未列出的关节用骨架静止姿态 */
export type JointEulers = Readonly<Record<string, readonly [number, number, number]>>

/** 逐帧欧拉角函数（t 秒 → 各关节欧拉角） */
export type PoseFunction = (t: number) => JointEulers

/**
 * 体形姿态烘焙：把逐帧欧拉角函数按骨架静止位置烘焙为 clip（关节只改旋转，位置用骨架定义静止值）。
 * 每个体形分包用本工具把自己的 `pose_fns` 烘成 `base_clips`。
 */
export const bakePoseClip = (
    name: string,
    duration: number,
    loop: boolean,
    skeleton: SkeletonDefinition,
    poseFn: PoseFunction,
    fps?: number,
): BoneAnimationClip => {
    const jointIds = skeleton.joints.map(joint => joint.id)
    const rest = new Map<string, Vector3>(skeleton.joints.map(joint => [joint.id, new Vector3().fromArray([...joint.position])]))
    return bakeClip(name, duration, loop, jointIds, (t): ReadonlyMap<string, BakedJointPose> => {
        const eulers = poseFn(t)
        const map = new Map<string, BakedJointPose>()
        for (const id of jointIds) {
            const e = eulers[id]
            if (e === undefined) continue
            const position = rest.get(id)
            if (position === undefined) continue
            map.set(id, {position: position.clone(), rotation: new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2], 'XYZ'))})
        }
        return map
    }, fps)
}
