import {Euler, Quaternion, Vector3} from 'three'
import type {JointEulers} from '../creature_runtime/pose.ts'
import {isPoseWithPosition} from '../creature_runtime/pose.ts'
import type {JointPose as SkeletonJointPose, Skeleton, SkeletonPose} from '../../../../../skeleton/skeleton.ts'

/** 欧拉姿态 → 骨架 pose：只旋转的姿态沿用桥接骨架当前局部位置 */
export const jointEulersToSkeletonPose = (
    pose: JointEulers,
    skeleton?: Skeleton,
): SkeletonPose => {
    const jointPoses = new Map<string, SkeletonJointPose>()
    for (const [jointId, jointPose] of Object.entries(pose)) {
        if (isPoseWithPosition(jointPose)) {
            const [x, y, z] = jointPose.position
            const [rx, ry, rz] = jointPose.rotation
            jointPoses.set(jointId, {
                position: new Vector3(x, y, z),
                rotation: new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
            })
        } else {
            const current = skeleton?.findJoint(jointId)?.position.clone()
            jointPoses.set(jointId, {
                position: current ?? new Vector3(),
                rotation: new Quaternion().setFromEuler(new Euler(jointPose[0], jointPose[1], jointPose[2], 'XYZ')),
            })
        }
    }
    return {jointPoses, boneRolls: new Map()}
}
