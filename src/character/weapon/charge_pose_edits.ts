/**
 * 近战蓄力姿势的欧拉修订（与 `attack_pose_edits.ts` 同构）：对 `charge_clip_data.ts` 的 base clip
 * 在进度 0（起始位）与 1（满蓄力位）写入关节局部 XYZ 欧拉角。
 *
 * - 进度 0 = 持械戒备（与 idle / 攻击收招一致，蓄力起手无跳变）；
 * - 进度 1 = 满蓄力后引位（沿用普通重击起手帧，保证松开后自然切入重击）。
 */
type JointPose = readonly [number, number, number]

export interface ChargePoseEdit {
    readonly time: number
    readonly joints: Readonly<Record<string, JointPose>>
}

/** 持械戒备（与 `attack_pose_edits.ts` 的 READY 一致） */
const READY = {
    rightArmShoulder: [-0.45, 0, 0],
    rightArmElbow: [-0.85, 0, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [1.7, 0, 0],
    leftArmShoulder: [0, 0, 0],
    leftArmElbow: [-0.1, 0, 0],
} as const satisfies Readonly<Record<string, JointPose>>

/** 满蓄力后引（举械后摆至最大幅度；沿用单持重击起手帧） */
const WINDUP = {
    rightArmShoulder: [-1.919, 0.266, 1.473],
    rightArmElbow: [-1.027, 0, 0],
    rightWristPivot: [0.014, 0, 0],
    rightWeaponMount: [3.012, 0, 0],
    leftArmShoulder: [0.35, 0, -0.45],
    leftArmElbow: [-0.7, 0, 0],
} as const satisfies Readonly<Record<string, JointPose>>

/** 专用蓄力姿势修订（键 = `charge_clip_data.ts` 的 clip id） */
export const CHARGE_POSE_EDITS: Readonly<Record<string, readonly ChargePoseEdit[]>> = {
    charge_melee_one_handed: [{time: 0, joints: READY}, {time: 1, joints: WINDUP}],
    charge_melee_two_handed: [{time: 0, joints: READY}, {time: 1, joints: WINDUP}],
    charge_melee_dual_wield: [{time: 0, joints: READY}, {time: 1, joints: WINDUP}],
}
