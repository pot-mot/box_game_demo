import {
    WEAPON_READY_SHOULDER,
    WEAPON_READY_ELBOW,
    WEAPON_READY_SWAY,
    WEAPON_GRIP_FLEX,
    WEAPON_WALK_ARM_SWING,
    HIP_Y,
    FLINCH_SPINE_BACK,
    FLINCH_ARM_RAISE,
    FLINCH_ARM_SPREAD,
    FLINCH_ELBOW,
    FLINCH_HEAD_BACK,
} from './constants.ts'
import {FLINCH_DURATION} from '../../../character/combat/attack_phases.ts'
import type {HoldMode} from '../../../character/weapon/hold_mode.ts'

/** 关节欧拉姿态 */
export interface JointEulerState {
    readonly rx: number
    readonly ry: number
    readonly rz: number
}

/** 姿态快照（clip 生成器采样输出，覆盖模型全部可动画关节） */
export interface PoseState {
    readonly rightArmShoulder: JointEulerState
    readonly rightArmElbow: JointEulerState
    readonly rightHandPivot: JointEulerState
    readonly rightWristPivot: JointEulerState
    readonly rightWeaponMount: JointEulerState
    readonly leftArmShoulder: JointEulerState
    readonly leftArmElbow: JointEulerState
    readonly leftHandPivot: JointEulerState
    readonly leftWristPivot: JointEulerState
    readonly leftWeaponMount: JointEulerState
    readonly rightLegHip: JointEulerState
    readonly rightLegKnee: JointEulerState
    readonly leftLegHip: JointEulerState
    readonly leftLegKnee: JointEulerState
    readonly headNeck: JointEulerState
    readonly spine: {rotation: JointEulerState; position: readonly [number, number, number]}
    readonly root: {rotation: JointEulerState}
}

const ZERO: JointEulerState = {rx: 0, ry: 0, rz: 0}

/** 持械握持：施加在左右手武器骨骼上的固定屈角，使武器相对前臂保持垂直 */
const GRIP_BONE_POSE: JointEulerState = {rx: WEAPON_GRIP_FLEX, ry: 0, rz: 0}

/** 生成器上下文（horizontalSpeed 用于 falling 腿张开随速度；行走步频由播放器 setSpeed 变速） */
export interface PoseContext {
    readonly weaponHeld: boolean
    readonly horizontalSpeed: number
}

/** 固定步频（rad/s）：原式在 3.6 m/s 匀速时频率 ≈5.9，取整 6 保持基准视觉 */
const WALK_CYCLE_FREQ = 6

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)

const idlePose = (t: number, ctx: PoseContext): PoseState => ({
    rightArmShoulder: {
        rx: ctx.weaponHeld ? WEAPON_READY_SHOULDER + Math.sin(t * 1.8) * WEAPON_READY_SWAY : Math.sin(t * 1.8) * 0.06,
        ry: 0,
        rz: 0,
    },
    rightArmElbow: {rx: ctx.weaponHeld ? WEAPON_READY_ELBOW : -0.08, ry: 0, rz: 0},
    rightHandPivot: ZERO,
    rightWristPivot: ZERO,
    rightWeaponMount: ctx.weaponHeld ? GRIP_BONE_POSE : ZERO,
    leftArmShoulder: {rx: -Math.sin(t * 1.8) * 0.06, ry: 0, rz: 0},
    leftArmElbow: {rx: -0.08, ry: 0, rz: 0},
    leftHandPivot: ZERO,
    leftWristPivot: ZERO,
    leftWeaponMount: ctx.weaponHeld ? GRIP_BONE_POSE : ZERO,
    rightLegHip: ZERO,
    rightLegKnee: ZERO,
    leftLegHip: ZERO,
    leftLegKnee: ZERO,
    headNeck: {rx: Math.sin(t * 2.5) * 0.02, ry: 0, rz: 0},
    spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
    root: {rotation: ZERO},
})

const walkingPose = (t: number, ctx: PoseContext): PoseState => {
    const legSwing = Math.sin(t) * 0.5
    const kneeBend = Math.max(0, -Math.cos(t)) * 0.35
    const swingAbs = Math.abs(Math.sin(t))
    const armSwing = -Math.sin(t) * 0.35
    const armBend = Math.max(0, Math.cos(t)) * 0.2
    return {
        rightArmShoulder: {
            rx: ctx.weaponHeld ? WEAPON_READY_SHOULDER - Math.sin(t) * WEAPON_WALK_ARM_SWING : armSwing,
            ry: 0,
            rz: 0,
        },
        rightArmElbow: {rx: ctx.weaponHeld ? WEAPON_READY_ELBOW : -(armBend + 0.05), ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: ctx.weaponHeld ? GRIP_BONE_POSE : ZERO,
        leftArmShoulder: {rx: -armSwing, ry: 0, rz: 0},
        leftArmElbow: {rx: -(armBend + 0.05), ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ctx.weaponHeld ? GRIP_BONE_POSE : ZERO,
        rightLegHip: {rx: legSwing, ry: 0, rz: 0},
        rightLegKnee: {rx: swingAbs < 0.3 ? kneeBend : kneeBend * (1 - (swingAbs - 0.3) / 0.7), ry: 0, rz: 0},
        leftLegHip: {rx: -legSwing, ry: 0, rz: 0},
        leftLegKnee: {rx: swingAbs > 0.7 ? kneeBend * ((1 - swingAbs) / 0.3) : kneeBend, ry: 0, rz: 0},
        headNeck: {rx: Math.abs(Math.sin(t * 2)) * 0.04 - 0.02, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const CROUCH_END = 0.1
const EXTEND_END = 0.3

const jumpingPose = (t: number): PoseState => {
    let hip = 0
    let knee = 0
    let armUp = 0
    let elbow = 0
    if (t < CROUCH_END) {
        const p = t / CROUCH_END
        hip = p * 0.3
        knee = p * 0.5
        armUp = -p * 0.4
        elbow = p * 0.3
    } else if (t < EXTEND_END) {
        const p = (t - CROUCH_END) / (EXTEND_END - CROUCH_END)
        hip = (1 - p) * 0.3
        knee = (1 - p) * 0.5
        armUp = -p * 0.8
        elbow = p * 0.2
    } else {
        armUp = -0.8
        elbow = 0.15
    }
    return {
        rightArmShoulder: {rx: armUp, ry: 0, rz: 0},
        rightArmElbow: {rx: -elbow, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: ZERO,
        leftArmShoulder: {rx: armUp, ry: 0, rz: 0},
        leftArmElbow: {rx: -elbow, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ZERO,
        rightLegHip: {rx: hip, ry: 0, rz: 0},
        rightLegKnee: {rx: knee, ry: 0, rz: 0},
        leftLegHip: {rx: hip, ry: 0, rz: 0},
        leftLegKnee: {rx: knee, ry: 0, rz: 0},
        headNeck: ZERO,
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const fallingPose = (t: number, speed: number): PoseState => {
    const armZ = 0.3 + Math.sin(t * 0.8) * 0.1
    /* 腿随水平速度张开（与 master 一致：legSpread = min(speed,4) × 0.04） */
    const legSpread = Math.min(speed, 4) * 0.04
    return {
        rightArmShoulder: {rx: -1.2, ry: 0, rz: armZ},
        rightArmElbow: {rx: -0.3, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: ZERO,
        leftArmShoulder: {rx: -1.2, ry: 0, rz: -armZ},
        leftArmElbow: {rx: -0.3, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ZERO,
        rightLegHip: {rx: -0.15 - legSpread, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.1, ry: 0, rz: 0},
        leftLegHip: {rx: -0.15 + legSpread, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.1, ry: 0, rz: 0},
        headNeck: {rx: 0.15, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const FALL_END = 0.3

const dyingPose = (t: number): PoseState => {
    const p = clamp01(t / FALL_END)
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    return {
        rightArmShoulder: {rx: eased * 0.4, ry: 0, rz: eased * 0.6},
        rightArmElbow: {rx: -eased * 0.5, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: ZERO,
        leftArmShoulder: {rx: eased * 0.4, ry: 0, rz: -eased * 0.6},
        leftArmElbow: {rx: -eased * 0.5, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ZERO,
        rightLegHip: {rx: eased * 0.2, ry: 0, rz: 0},
        rightLegKnee: {rx: eased * 0.3, ry: 0, rz: 0},
        leftLegHip: {rx: eased * 0.2, ry: 0, rz: 0},
        leftLegKnee: {rx: eased * 0.3, ry: 0, rz: 0},
        headNeck: {rx: eased * 0.3, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: {rx: Math.PI / 2 * eased, ry: 0, rz: 0}},
    }
}

const dashingPose = (t: number): PoseState => {
    const legSwing = Math.sin(t * 30) * 0.15
    return {
        rightArmShoulder: {rx: -0.5, ry: 0, rz: 0},
        rightArmElbow: {rx: -0.3, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: ZERO,
        leftArmShoulder: {rx: -0.5, ry: 0, rz: 0},
        leftArmElbow: {rx: -0.3, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ZERO,
        rightLegHip: {rx: legSwing, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.05, ry: 0, rz: 0},
        leftLegHip: {rx: -legSwing, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.05, ry: 0, rz: 0},
        headNeck: {rx: 0.1, ry: 0, rz: 0},
        spine: {rotation: {rx: -0.15, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const flinchingPose = (t: number): PoseState => {
    const p = clamp01(t / FLINCH_DURATION)
    const e = 1 - Math.pow(1 - p, 3)
    return {
        rightArmShoulder: {rx: -FLINCH_ARM_RAISE * e, ry: 0, rz: FLINCH_ARM_SPREAD * e},
        rightArmElbow: {rx: FLINCH_ELBOW * e, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: ZERO,
        leftArmShoulder: {rx: -FLINCH_ARM_RAISE * e, ry: 0, rz: -FLINCH_ARM_SPREAD * e},
        leftArmElbow: {rx: FLINCH_ELBOW * e, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ZERO,
        rightLegHip: ZERO,
        rightLegKnee: ZERO,
        leftLegHip: ZERO,
        leftLegKnee: ZERO,
        headNeck: {rx: -FLINCH_HEAD_BACK * e, ry: 0, rz: 0},
        spine: {rotation: {rx: -FLINCH_SPINE_BACK * e, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

export type PoseSampler = (t: number, ctx: PoseContext) => PoseState

/** 基础状态 → 姿态采样器（公式与旧 animators 一一对应；falling 腿张开随速度，行走步频由播放器变速） */
export const BASE_POSE_SAMPLERS: Record<'idle' | 'walking' | 'jumping' | 'falling' | 'dying' | 'dashing' | 'flinching', PoseSampler> = {
    idle: (t, ctx) => idlePose(t, ctx),
    walking: (t, ctx) => walkingPose(t * WALK_CYCLE_FREQ, ctx),
    jumping: (t) => jumpingPose(t),
    falling: (t, ctx) => fallingPose(t, ctx.horizontalSpeed),
    dying: (t) => dyingPose(t),
    dashing: (t) => dashingPose(t),
    flinching: (t) => flinchingPose(t),
}

/**
 * 持握模式对上半身手臂姿态的调整（Q3 分层组合：上半身层按持握模式选取）：
 * - 单持 / 空手：维持基础姿态（右臂持械、左臂自然下垂）；
 * - 双手共持 / 双持：左臂与右臂同向前伸/挥摆（双手持握同一武器 / 各握一把武器）。
 * 仅对 idle / walking 的持械变体生效；跳跃/下落/死亡/受击等瞬态不施加。
 */
export const adjustArmsForHoldMode = (
    pose: PoseState,
    holdMode: HoldMode | undefined,
    weaponHeld: boolean,
    state: keyof typeof BASE_POSE_SAMPLERS,
): PoseState => {
    if (!weaponHeld || holdMode === undefined || holdMode === 'one_handed') return pose
    if (state !== 'idle' && state !== 'walking') return pose
    return {
        ...pose,
        leftArmShoulder: pose.rightArmShoulder,
        leftArmElbow: pose.rightArmElbow,
        leftHandPivot: pose.rightHandPivot,
        leftWristPivot: pose.rightWristPivot,
        leftWeaponMount: pose.rightWeaponMount,
    }
}

/** 各状态 clip 时长/循环（评审决议：循环 wrap / 非循环 clamp） */
export const BASE_CLIP_META: Record<keyof typeof BASE_POSE_SAMPLERS, {duration: number; loop: boolean}> = {
    idle: {duration: (Math.PI * 2) / 1.8, loop: true},
    walking: {duration: (Math.PI * 2) / WALK_CYCLE_FREQ, loop: true},
    jumping: {duration: EXTEND_END, loop: false},
    falling: {duration: 1, loop: true},
    dying: {duration: FALL_END, loop: false},
    dashing: {duration: (Math.PI * 2) / 30, loop: true},
    flinching: {duration: FLINCH_DURATION, loop: false},
}