import type {Group} from 'three'
import type {CreatureModel} from './types.ts'

/** 参与过渡混合的关节快照（旋转 + 位置） */
export interface JointSnapshot {
    readonly joint: Group
    readonly rx: number
    readonly ry: number
    readonly rz: number
    readonly px: number
    readonly py: number
    readonly pz: number
}

/** 收集模型全部关节（含根；顺序稳定） */
export const snapshotJoints = (model: CreatureModel): readonly JointSnapshot[] =>
    [...model.jointGroups.values()].map(joint => ({
        joint,
        rx: joint.rotation.x, ry: joint.rotation.y, rz: joint.rotation.z,
        px: joint.position.x, py: joint.position.y, pz: joint.position.z,
    }))

/**
 * 状态过渡：把当前关节向切换前快照加权收敛（三次 ease-out）。
 * 返回新的累计时间；调用方在 `>= duration` 后清空快照。
 */
export const applyJointBlend = (
    snapshots: readonly JointSnapshot[],
    elapsed: number,
    dt: number,
    duration: number,
): number => {
    const next = elapsed + dt
    const k = 1 - Math.pow(1 - Math.min(next / duration, 1), 3)
    for (const snap of snapshots) {
        const joint = snap.joint
        joint.rotation.x = snap.rx + (joint.rotation.x - snap.rx) * k
        joint.rotation.y = snap.ry + (joint.rotation.y - snap.ry) * k
        joint.rotation.z = snap.rz + (joint.rotation.z - snap.rz) * k
        joint.position.x = snap.px + (joint.position.x - snap.px) * k
        joint.position.y = snap.py + (joint.position.y - snap.py) * k
        joint.position.z = snap.pz + (joint.position.z - snap.pz) * k
    }
    return next
}
