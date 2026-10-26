import {
    WEAPON_READY_SHOULDER,
    WEAPON_READY_ELBOW,
    WEAPON_READY_SWAY,
    WEAPON_WALK_ARM_SWING,
    FLINCH_SPINE_BACK,
    FLINCH_ARM_RAISE,
    FLINCH_ARM_SPREAD,
    FLINCH_ELBOW,
    FLINCH_HEAD_BACK,
    BLOCK_SHOULDER,
    BLOCK_ELBOW,
    BLOCK_LEAN,
    BLOCK_SWAY,
    BLOCK_IDLE_SHOULDER,
    BLOCK_IDLE_ELBOW,
    SHIELD_FACE_NET_X,
    WALK_CYCLE_FREQ,
    SWIM_CYCLE_FREQ,
    JUMP_EXTEND_END as EXTEND_END,
    FALL_END,
} from '../state/constants.ts'
import {BLOCKING_POSE_PERIOD, GUARD_BROKEN_POSE_DURATION, HIP_Y, SWIM_PRONE_PITCH, WEAPON_GRIP_FLEX} from '../../../appearance/constants.ts'
import {FLINCH_DURATION} from '../../../../../character/combat/attack_phases.ts'
import {
    DEFAULT_GET_UP_DURATION,
    GET_UP_PLANT_END,
    GET_UP_PUSH_END,
} from '../../../../../character/combat/constants.ts'
import {ROLL_DURATION} from '../../../../../character/combat/roll_skill.ts'
import {INTERACTION_DURATION} from '../../../../../character/interaction/types.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import {HUMANOID_CLIP_STATE_META as BASE_CLIP_META} from '../state/form_base.ts'

export {BASE_CLIP_META}

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

/**
 * 待机 / 行走的武器骨骼屈角。
 * 弓需要与地面垂直：以「净屈角 = 90°」反推武器骨骼，使弓臂沿世界上下、箭向水平；
 * 肩 / 肘摆动时同步补偿，弓身始终竖直。其他武器沿用通用握持屈角。
 */
const weaponMountPose = (ctx: PoseContext): JointEulerState =>
    ctx.weaponHeld ? GRIP_BONE_POSE : ZERO

/* 弓的待机 / 行走持握：右手（持弦手）收在身前中线，弓身竖直、箭向朝前；
 * 左支撑手可自然搭到弓把（离线烘焙无需拉长手臂）。 */
const BOW_IDLE_SHOULDER: JointEulerState = {rx: 0.15, ry: 0.45, rz: 0}
const BOW_IDLE_ELBOW_RX = -2.1
const BOW_IDLE_MOUNT: JointEulerState = {rx: -2.747647, ry: -0.065046, rz: 0.445593}

/** 生成器上下文（horizontalSpeed 用于 falling 腿张开随速度；行走步频由播放器 setSpeed 变速） */
export interface PoseContext {
    readonly weaponHeld: boolean
    /** 当前武器 classId（用于弓等武器固有持握姿态；空手 / 未提供 = 通用握持） */
    readonly weaponClassId?: string
    readonly horizontalSpeed: number
    /** 垂直速度（m/s，向上为正）：falling 收腿 / 抬头参数 */
    readonly verticalSpeed?: number
    /** 格挡举盾手（blocking 姿态决定抬起哪只手臂；undefined = 默认主手 / 右臂） */
    readonly blockArm?: 'right' | 'left'
}

/** 固定步频（rad/s）：原式在 3.6 m/s 匀速时频率 ≈5.9，取整 6 保持基准视觉 */


const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)

const idlePose = (t: number, ctx: PoseContext): PoseState => {
    const bow = ctx.weaponHeld && ctx.weaponClassId === 'longbow'
    const idleShoulder = ctx.weaponHeld ? WEAPON_READY_SHOULDER + Math.sin(t * 1.8) * WEAPON_READY_SWAY : Math.sin(t * 1.8) * 0.06
    const idleElbow = ctx.weaponHeld ? WEAPON_READY_ELBOW : -0.08
    return {
        rightArmShoulder: bow ? {...BOW_IDLE_SHOULDER} : {rx: idleShoulder, ry: 0, rz: 0},
        rightArmElbow: {rx: bow ? BOW_IDLE_ELBOW_RX : idleElbow, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: bow ? {...BOW_IDLE_MOUNT} : weaponMountPose(ctx),
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
    }
}

const walkingPose = (t: number, ctx: PoseContext): PoseState => {
    const legSwing = Math.sin(t) * 0.5
    const kneeBend = Math.max(0, -Math.cos(t)) * 0.35
    const swingAbs = Math.abs(Math.sin(t))
    const armSwing = -Math.sin(t) * 0.35
    const armBend = Math.max(0, Math.cos(t)) * 0.2
    const bow = ctx.weaponHeld && ctx.weaponClassId === 'longbow'
    const walkShoulder = ctx.weaponHeld ? WEAPON_READY_SHOULDER - Math.sin(t) * WEAPON_WALK_ARM_SWING : armSwing
    const walkElbow = ctx.weaponHeld ? WEAPON_READY_ELBOW : -(armBend + 0.05)
    return {
        rightArmShoulder: bow ? {...BOW_IDLE_SHOULDER} : {rx: walkShoulder, ry: 0, rz: 0},
        rightArmElbow: {rx: bow ? BOW_IDLE_ELBOW_RX : walkElbow, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: bow ? {...BOW_IDLE_MOUNT} : weaponMountPose(ctx),
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

/** 跑步：更大步幅与摆臂、躯干前倾；武器仍保持戒备握持 */
const sprintingPose = (t: number, ctx: PoseContext): PoseState => {
    const legSwing = Math.sin(t) * 0.78
    const kneeBend = Math.max(0, -Math.cos(t)) * 0.62
    const swingAbs = Math.abs(Math.sin(t))
    const armSwing = -Math.sin(t) * 0.62
    const bow = ctx.weaponHeld && ctx.weaponClassId === 'longbow'
    const armBend = Math.max(0, Math.cos(t)) * 0.35 + 0.15
    const runShoulder = ctx.weaponHeld ? WEAPON_READY_SHOULDER - Math.sin(t) * WEAPON_WALK_ARM_SWING * 1.5 : armSwing
    const runElbow = ctx.weaponHeld ? WEAPON_READY_ELBOW : -armBend
    return {
        rightArmShoulder: bow ? {...BOW_IDLE_SHOULDER} : {rx: runShoulder, ry: 0, rz: 0},
        rightArmElbow: {rx: bow ? BOW_IDLE_ELBOW_RX : runElbow, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: bow ? {...BOW_IDLE_MOUNT} : weaponMountPose(ctx),
        leftArmShoulder: {rx: -armSwing, ry: 0, rz: 0},
        leftArmElbow: {rx: -armBend, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: ctx.weaponHeld ? GRIP_BONE_POSE : ZERO,
        rightLegHip: {rx: legSwing, ry: 0, rz: 0},
        rightLegKnee: {rx: swingAbs < 0.35 ? kneeBend : kneeBend * (1 - (swingAbs - 0.35) / 0.65), ry: 0, rz: 0},
        leftLegHip: {rx: -legSwing, ry: 0, rz: 0},
        leftLegKnee: {rx: swingAbs > 0.65 ? kneeBend * ((1 - swingAbs) / 0.35) : kneeBend, ry: 0, rz: 0},
        headNeck: {rx: -0.12 + Math.abs(Math.sin(t * 2)) * 0.03, ry: 0, rz: 0},
        spine: {rotation: {rx: 0.16, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/**
 * 飞行：双臂向两侧后掠，双腿自然下垂后摆，躯干轻微前倾；轻微起伏模拟悬停。
 * Z / X 升降只改变物理速度，姿态保持稳定的悬停轮廓（避免升降时肢体抖动）。
 */
const flyingPose = (t: number, ctx: PoseContext): PoseState => {
    const bob = Math.sin(t * 1.4) * 0.06
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    const armZ = 0.72 + Math.sin(t * 1.4 + 0.6) * 0.05
    return {
        rightArmShoulder: {rx: -0.35 + bob * 0.4, ry: 0, rz: -armZ},
        rightArmElbow: {rx: -0.25, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -0.35 - bob * 0.4, ry: 0, rz: armZ},
        leftArmElbow: {rx: -0.25, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: -0.18 + bob * 0.2, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.18, ry: 0, rz: 0},
        leftLegHip: {rx: -0.12 - bob * 0.2, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.24, ry: 0, rz: 0},
        headNeck: {rx: 0.08, ry: 0, rz: 0},
        spine: {rotation: {rx: 0.12, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const CROUCH_END = 0.1

const jumpingPose = (t: number, ctx: PoseContext): PoseState => {
    let hip = 0
    let knee = 0
    let armUp: number
    let elbow: number
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
    /* 持械时武器骨骼保持握持屈角，与待机 / 行走等常规状态一致（否则武器贴合前臂穿模） */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: armUp, ry: 0, rz: 0},
        rightArmElbow: {rx: -elbow, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: armUp, ry: 0, rz: 0},
        leftArmElbow: {rx: -elbow, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: hip, ry: 0, rz: 0},
        rightLegKnee: {rx: knee, ry: 0, rz: 0},
        leftLegHip: {rx: hip, ry: 0, rz: 0},
        leftLegKnee: {rx: knee, ry: 0, rz: 0},
        headNeck: ZERO,
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const fallingPose = (t: number, ctx: PoseContext): PoseState => {
    const armZ = 0.3 + Math.sin(t * 0.8) * 0.1
    /* 腿随水平速度张开（legSpread = min(speed,4) × 0.04） */
    const legSpread = Math.min(ctx.horizontalSpeed, 4) * 0.04
    /* 下坠越快，双腿越收（垂直速度参数） */
    const fallTuck = Math.min(Math.max(0, -(ctx.verticalSpeed ?? 0)) / 10, 1) * 0.25
    /* 持械时武器骨骼保持握持屈角，与待机 / 行走等常规状态一致 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: -1.2, ry: 0, rz: -armZ},
        rightArmElbow: {rx: -0.3, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -1.2, ry: 0, rz: armZ},
        leftArmElbow: {rx: -0.3, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: -0.15 - legSpread + fallTuck, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.1 + fallTuck, ry: 0, rz: 0},
        leftLegHip: {rx: -0.15 + legSpread + fallTuck, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.1 + fallTuck, ry: 0, rz: 0},
        headNeck: {rx: 0.15, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/** 漂浮（直立踩水）：双臂外张轻摆、双腿微屈、轻微起伏 */
const floatingPose = (t: number, ctx: PoseContext): PoseState => {
    const bob = Math.sin(t * 1.6) * 0.15
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: -0.2, ry: 0, rz: -0.7 + bob * 0.3},
        rightArmElbow: {rx: -0.4, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -0.2, ry: 0, rz: 0.7 - bob * 0.3},
        leftArmElbow: {rx: -0.4, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: 0.3 + bob * 0.1, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.5, ry: 0, rz: 0},
        leftLegHip: {rx: 0.3 - bob * 0.1, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.5, ry: 0, rz: 0},
        headNeck: {rx: -0.1, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/** 游泳（俯卧由 world.ts 根姿态合成）：双臂交替划水、双腿打水 */
const swimmingPose = (t: number, ctx: PoseContext): PoseState => {
    /* clip 时长 = 2π / SWIM_CYCLE_FREQ，采样频率必须同源，才能一个 clip 播放完整划水周期 */
    const stroke = Math.sin(t * SWIM_CYCLE_FREQ)
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: -Math.PI * 0.75 + stroke * 0.8, ry: 0, rz: -0.2},
        rightArmElbow: {rx: -0.5, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -Math.PI * 0.75 - stroke * 0.8, ry: 0, rz: 0.2},
        leftArmElbow: {rx: -0.5, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: stroke * 0.4, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.2, ry: 0, rz: 0},
        leftLegHip: {rx: -stroke * 0.4, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.2, ry: 0, rz: 0},
        /* 根节点已前倾 SWIM_PRONE_PITCH；颈部反向旋转抵消，使脸朝向前方而不是一直向下 */
        headNeck: {rx: -SWIM_PRONE_PITCH, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}



/**
 * 死亡动画（保持直立）：只做四肢与躯干的松散塌陷，**不旋转根关节**。
 * 倒下方向由死亡 state 依据最后受击的冲击方向决定，在世界层（`world.ts`）绕水平轴合成，
 * 以便放置 / 游玩模式按受击方向倒地（骨骼编辑器预览即直立姿态）。
 */
const dyingPose = (t: number, ctx: PoseContext): PoseState => {
    const p = clamp01(t / FALL_END)
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    /* 持械时武器骨骼保持握持屈角，与待机 / 行走等常规状态一致 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: eased * 0.4, ry: 0, rz: -eased * 0.6},
        rightArmElbow: {rx: -eased * 0.5, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: eased * 0.4, ry: 0, rz: eased * 0.6},
        leftArmElbow: {rx: -eased * 0.5, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: eased * 0.2, ry: 0, rz: 0},
        rightLegKnee: {rx: eased * 0.3, ry: 0, rz: 0},
        leftLegHip: {rx: eased * 0.2, ry: 0, rz: 0},
        leftLegKnee: {rx: eased * 0.3, ry: 0, rz: 0},
        headNeck: {rx: eased * 0.3, ry: 0, rz: 0},
        spine: {rotation: ZERO, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/** 翻滚蜷缩收拢进度（0-1 动作时间）：起手 25% 抱团 → 中段保持 → 末段 25% 展开站立 */
const ROLL_TUCK_IN_END = 0.25
const ROLL_RELEASE_START = 0.75

/**
 * 翻滚：抱团蜷缩（肩/髋前收、肘膝深屈、躯干前屈）。
 * **前滚翻的根自转 2π 由 world 层按动作时间合成**（同死亡倒地：编辑器预览只含蜷缩姿态，
 * 避免根关节绕脚底原点旋转出现沉入地面的大圈）。
 */
const rollingPose = (t: number, ctx: PoseContext): PoseState => {
    const p = clamp01(t / ROLL_DURATION)
    const raw = p < ROLL_TUCK_IN_END
        ? p / ROLL_TUCK_IN_END
        : p < ROLL_RELEASE_START
            ? 1
            : 1 - (p - ROLL_RELEASE_START) / (1 - ROLL_RELEASE_START)
    const e = raw * raw * (3 - 2 * raw)
    /* 持械时武器骨骼回到垂直握持，避免蜷缩时武器穿身 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: -1.35 * e, ry: 0, rz: -0.2 * e},
        rightArmElbow: {rx: -1.7 * e, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -1.35 * e, ry: 0, rz: 0.2 * e},
        leftArmElbow: {rx: -1.7 * e, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: -1.25 * e, ry: 0, rz: 0},
        rightLegKnee: {rx: 2 * e, ry: 0, rz: 0},
        leftLegHip: {rx: -1.25 * e, ry: 0, rz: 0},
        leftLegKnee: {rx: 2 * e, ry: 0, rz: 0},
        headNeck: {rx: 0.5 * e, ry: 0, rz: 0},
        spine: {rotation: {rx: 0.55 * e, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const flinchingPose = (t: number, ctx: PoseContext): PoseState => {
    const p = clamp01(t / FLINCH_DURATION)
    const e = 1 - Math.pow(1 - p, 3)
    /* 持械时武器骨骼保持握持屈角，与待机 / 行走等常规状态一致 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: -FLINCH_ARM_RAISE * e, ry: 0, rz: -FLINCH_ARM_SPREAD * e},
        rightArmElbow: {rx: FLINCH_ELBOW * e, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -FLINCH_ARM_RAISE * e, ry: 0, rz: FLINCH_ARM_SPREAD * e},
        leftArmElbow: {rx: FLINCH_ELBOW * e, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: ZERO,
        rightLegKnee: ZERO,
        leftLegHip: ZERO,
        leftLegKnee: ZERO,
        headNeck: {rx: -FLINCH_HEAD_BACK * e, ry: 0, rz: 0},
        spine: {rotation: {rx: -FLINCH_SPINE_BACK * e, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/* ── 倒地 / 起身姿态 ──
 * 身体「倒下」的根旋转由 world 层按受击方向合成（与 dying / rolling 同机制），
 * 姿势本身负责四肢：倒地时松软伏地；起身时按「双手撑地 → 蹬手收腿推起 → 站直」的顺序发力。
 * 阶段比例与 `states/getting_up.ts` 的根旋转曲线共用同一组常量，避免手脚与身体脱节。 */

/** 倒地姿态收敛时长（秒） */
const KNOCKDOWN_POSE_SETTLE = 0.2

interface GetUpKeyframe {
    readonly shoulderRx: number
    readonly shoulderRz: number
    readonly elbowRx: number
    readonly hipRx: number
    readonly kneeRx: number
    readonly headRx: number
    readonly spineRx: number
}

/* 关节弯折方向恒定按自然方向：肘 `rx <= 0`（前臂向前屈）、膝 `rx >= 0`（小腿向后屈），
 * 不得靠整体取反来改变弯折方向（否则肘 / 膝会反关节）。
 * 伏地姿势与倒地朝向无关：同一帧既是倒地末帧也是起身首帧，保证状态切换零跳变。 */

/** 完全伏地：手臂向体侧摊开并压向地面，双腿自然贴地 */
const DOWNED: GetUpKeyframe = {
    shoulderRx: 0.8,
    shoulderRz: 0.5,
    elbowRx: -1.2,
    hipRx: 0.08,
    kneeRx: 0.25,
    headRx: 0.4,
    spineRx: 0.3,
}

/** 起身起始 = 伏地末帧（与倒地最后一帧完全一致） */
const GETUP_DOWNED: GetUpKeyframe = DOWNED

/** 双手撑地：肘继续屈曲把上身撑住，抬头，膝略收 */
const GETUP_BRACE: GetUpKeyframe = {
    shoulderRx: 0.8,
    shoulderRz: 0.3,
    elbowRx: -1.6,
    hipRx: 0.1,
    kneeRx: 0.6,
    headRx: 0.15,
    spineRx: 0.45,
}

/** 蹬手推起：肘部蹬直把上身顶起，同时收腿把膝盖收到身下（蹲姿） */
const GETUP_PUSH: GetUpKeyframe = {
    shoulderRx: 0.2,
    shoulderRz: 0.18,
    elbowRx: -0.2,
    hipRx: -0.55,
    kneeRx: 1.2,
    headRx: 0,
    spineRx: 0.5,
}

/** 站立中立位 */
const GETUP_STAND: GetUpKeyframe = {
    shoulderRx: 0,
    shoulderRz: 0,
    elbowRx: 0,
    hipRx: 0,
    kneeRx: 0,
    headRx: 0,
    spineRx: 0,
}

const lerpNumber = (a: number, b: number, k: number): number => a + (b - a) * k
const smoothstep = (p: number): number => p * p * (3 - 2 * p)

const scaleKeyframe = (k: GetUpKeyframe, s: number): GetUpKeyframe => ({
    shoulderRx: k.shoulderRx * s,
    shoulderRz: k.shoulderRz * s,
    elbowRx: k.elbowRx * s,
    hipRx: k.hipRx * s,
    kneeRx: k.kneeRx * s,
    headRx: k.headRx * s,
    spineRx: k.spineRx * s,
})

const lerpKeyframe = (a: GetUpKeyframe, b: GetUpKeyframe, k: number): GetUpKeyframe => ({
    shoulderRx: lerpNumber(a.shoulderRx, b.shoulderRx, k),
    shoulderRz: lerpNumber(a.shoulderRz, b.shoulderRz, k),
    elbowRx: lerpNumber(a.elbowRx, b.elbowRx, k),
    hipRx: lerpNumber(a.hipRx, b.hipRx, k),
    kneeRx: lerpNumber(a.kneeRx, b.kneeRx, k),
    headRx: lerpNumber(a.headRx, b.headRx, k),
    spineRx: lerpNumber(a.spineRx, b.spineRx, k),
})

/** 起身进度 0-1 → 关键帧（撑地 → 推起 → 站直） */
const getUpKeyframeAt = (p: number): GetUpKeyframe => {
    if (p <= GET_UP_PLANT_END) {
        return lerpKeyframe(GETUP_DOWNED, GETUP_BRACE, smoothstep(clamp01(p / GET_UP_PLANT_END)))
    }
    if (p <= GET_UP_PUSH_END) {
        const k = smoothstep(clamp01((p - GET_UP_PLANT_END) / (GET_UP_PUSH_END - GET_UP_PLANT_END)))
        return lerpKeyframe(GETUP_BRACE, GETUP_PUSH, k)
    }
    return lerpKeyframe(GETUP_PUSH, GETUP_STAND, smoothstep(clamp01((p - GET_UP_PUSH_END) / (1 - GET_UP_PUSH_END))))
}

const poseFromKeyframe = (k: GetUpKeyframe, ctx: PoseContext): PoseState => {
    /* 持械时武器骨骼回到垂直握持，避免倒地 / 撑地时武器穿身 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: k.shoulderRx, ry: 0, rz: -k.shoulderRz},
        rightArmElbow: {rx: k.elbowRx, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: k.shoulderRx, ry: 0, rz: k.shoulderRz},
        leftArmElbow: {rx: k.elbowRx, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: k.hipRx, ry: 0, rz: 0},
        rightLegKnee: {rx: k.kneeRx, ry: 0, rz: 0},
        leftLegHip: {rx: k.hipRx, ry: 0, rz: 0},
        leftLegKnee: {rx: k.kneeRx, ry: 0, rz: 0},
        headNeck: {rx: k.headRx, ry: 0, rz: 0},
        spine: {rotation: {rx: k.spineRx, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

const downedPose = (e: number, ctx: PoseContext): PoseState =>
    poseFromKeyframe(scaleKeyframe(DOWNED, e), ctx)

const knockdownPose = (t: number, ctx: PoseContext): PoseState =>
    downedPose(clamp01(t / KNOCKDOWN_POSE_SETTLE), ctx)

const gettingUpPose = (t: number, ctx: PoseContext): PoseState =>
    poseFromKeyframe(getUpKeyframeAt(clamp01(t / DEFAULT_GET_UP_DURATION)), ctx)

export type PoseSampler = (t: number, ctx: PoseContext) => PoseState

/* ── 交互姿态：伸手（0→REACH_END）→ 发力后收回（REACH_END→INTERACTION_DURATION） ── */
const INTERACTION_REACH_END = 0.45
const INTERACTION_ARM_SHOULDER = 1.05
const INTERACTION_ARM_ELBOW = 0.45
const INTERACTION_LEAN = 0.12

const interactingPose = (t: number, ctx: PoseContext): PoseState => {
    const total = INTERACTION_DURATION
    const reach = t < INTERACTION_REACH_END
        ? clamp01(t / INTERACTION_REACH_END)
        : 1 - clamp01((t - INTERACTION_REACH_END) / Math.max(total - INTERACTION_REACH_END, 0.0001))
    const e = reach
    /* 持械时武器骨骼保持握持屈角，与待机 / 行走等常规状态一致 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: -INTERACTION_ARM_SHOULDER * e, ry: 0, rz: 0},
        rightArmElbow: {rx: -(INTERACTION_ARM_ELBOW * e + 0.08), ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: -0.06 * e, ry: 0, rz: 0},
        leftArmElbow: {rx: -0.08, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: ZERO,
        rightLegKnee: ZERO,
        leftLegHip: ZERO,
        leftLegKnee: ZERO,
        headNeck: {rx: 0.10 * e, ry: 0, rz: 0},
        spine: {rotation: {rx: INTERACTION_LEAN * e, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/* ── 格挡 / 破防姿态 ──
 * 举盾：`blockArm` 决定抬哪只手臂（主手盾 = 右臂，副手盾 = 左臂），另一只手持械则保持戒备位、空手则自然下垂。 */

/** 单臂关节姿态（举盾 / 戒备 / 下垂三选一） */
interface ArmPose {
    readonly shoulder: JointEulerState
    readonly elbow: JointEulerState
    readonly mount: JointEulerState
}

const blockingPose = (t: number, ctx: PoseContext): PoseState => {
    const sway = Math.sin((t / BLOCKING_POSE_PERIOD) * Math.PI * 2) * BLOCK_SWAY
    const guardArm: ArmPose = {
        shoulder: {rx: BLOCK_SHOULDER + sway, ry: 0, rz: 0},
        elbow: {rx: BLOCK_ELBOW, ry: 0, rz: 0},
        mount: GRIP_BONE_POSE,
    }
    const idleArm: ArmPose = {
        shoulder: {rx: BLOCK_IDLE_SHOULDER, ry: 0, rz: 0},
        elbow: {rx: BLOCK_IDLE_ELBOW, ry: 0, rz: 0},
        mount: ZERO,
    }
    /* 非举盾侧：副手盾时主手仍握械（戒备位），主手盾时空手（自然下垂） */
    const offArm: ArmPose = ctx.blockArm === 'left' && ctx.weaponHeld
        ? {shoulder: {rx: WEAPON_READY_SHOULDER, ry: 0, rz: 0}, elbow: {rx: WEAPON_READY_ELBOW, ry: 0, rz: 0}, mount: GRIP_BONE_POSE}
        : idleArm
    const isLeft = ctx.blockArm === 'left'
    const rightArm = isLeft ? offArm : guardArm
    const leftArm = isLeft ? guardArm : offArm
    return {
        rightArmShoulder: rightArm.shoulder,
        rightArmElbow: rightArm.elbow,
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: rightArm.mount,
        leftArmShoulder: leftArm.shoulder,
        leftArmElbow: leftArm.elbow,
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: leftArm.mount,
        rightLegHip: {rx: 0.06, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.12, ry: 0, rz: 0},
        leftLegHip: {rx: 0.06, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.12, ry: 0, rz: 0},
        headNeck: {rx: 0.05, ry: 0, rz: 0},
        spine: {rotation: {rx: BLOCK_LEAN, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/** 破防：双臂脱力下垂、躯干后仰下沉（ease-out 到位后保持）。 */
const guardBrokenPose = (t: number, ctx: PoseContext): PoseState => {
    const e = 1 - Math.pow(1 - clamp01(t / GUARD_BROKEN_POSE_DURATION), 3)
    /* 持械时武器骨骼保持握持屈角，与待机 / 行走等常规状态一致 */
    const grip = ctx.weaponHeld ? GRIP_BONE_POSE : ZERO
    return {
        rightArmShoulder: {rx: 0.25 * e, ry: 0, rz: -0.25 * e},
        rightArmElbow: {rx: -0.45 * e, ry: 0, rz: 0},
        rightHandPivot: ZERO,
        rightWristPivot: ZERO,
        rightWeaponMount: grip,
        leftArmShoulder: {rx: 0.25 * e, ry: 0, rz: 0.25 * e},
        leftArmElbow: {rx: -0.45 * e, ry: 0, rz: 0},
        leftHandPivot: ZERO,
        leftWristPivot: ZERO,
        leftWeaponMount: grip,
        rightLegHip: {rx: -0.15 * e, ry: 0, rz: 0},
        rightLegKnee: {rx: 0.35 * e, ry: 0, rz: 0},
        leftLegHip: {rx: -0.15 * e, ry: 0, rz: 0},
        leftLegKnee: {rx: 0.35 * e, ry: 0, rz: 0},
        headNeck: {rx: -FLINCH_HEAD_BACK * e, ry: 0, rz: 0},
        spine: {rotation: {rx: -FLINCH_SPINE_BACK * e, ry: 0, rz: 0}, position: [0, HIP_Y, 0]},
        root: {rotation: ZERO},
    }
}

/** 基础状态 → 姿态采样器（falling 腿张开随速度，行走步频由播放器变速） */
export const BASE_POSE_SAMPLERS: Record<BaseClipState, PoseSampler> = {
    idle: (t, ctx) => idlePose(t, ctx),
    walking: (t, ctx) => walkingPose(t * WALK_CYCLE_FREQ, ctx),
    sprinting: (t, ctx) => sprintingPose(t * WALK_CYCLE_FREQ * 1.4, ctx),
    jumping: (t, ctx) => jumpingPose(t, ctx),
    falling: (t, ctx) => fallingPose(t, ctx),
    flying: (t, ctx) => flyingPose(t, ctx),
    swimming: (t, ctx) => swimmingPose(t, ctx),
    floating: (t, ctx) => floatingPose(t, ctx),
    dying: (t, ctx) => dyingPose(t, ctx),
    rolling: (t, ctx) => rollingPose(t, ctx),
    flinching: (t, ctx) => flinchingPose(t, ctx),
    interacting: (t, ctx) => interactingPose(t, ctx),
    knockdown: (t, ctx) => knockdownPose(t, ctx),
    getting_up: (t, ctx) => gettingUpPose(t, ctx),
    blocking: (t, ctx) => blockingPose(t, ctx),
    guard_broken: (t, ctx) => guardBrokenPose(t, ctx),
}

/** 持握必须保持的基础状态（死亡 / 倒地 / 起身 / 格挡除外：前者松手，后者由盾臂姿态接管） */
const HOLD_PERSISTENT_STATES: ReadonlySet<BaseClipState> = new Set<BaseClipState>([
    'idle', 'walking', 'sprinting', 'jumping', 'falling', 'flying', 'swimming', 'floating', 'rolling', 'flinching', 'interacting', 'guard_broken',
])

/** 双持副手持握戒备位：仅常态生效；falling / rolling / flinching 保留各自姿态 */
const DUAL_WIELD_READY_STATES: ReadonlySet<BaseClipState> = new Set<BaseClipState>([
    'idle', 'walking', 'sprinting', 'jumping', 'flying', 'swimming', 'floating', 'interacting', 'guard_broken',
])

/**
 * 持握模式对上半身手臂姿态的调整：
 * - 单持 / 空手：维持基础姿态（右臂持械、左臂自然下垂）；
 * - 双手共持：左臂与右臂同向前伸/挥摆（双手握同一把武器）；
 * - 双持：左右手各握一把武器，左臂保持自身姿态，禁止复制主手。
 * 持握在跳跃 / 下落 / 受击等瞬态保持。
 */
export const adjustArmsForHoldMode = (
    pose: PoseState,
    holdMode: HoldMode | undefined,
    weaponHeld: boolean,
    state: BaseClipState,
): PoseState => {
    if (!weaponHeld || holdMode === undefined || holdMode === 'one_handed') return pose
    if (holdMode === 'dual_wield') {
        if (!DUAL_WIELD_READY_STATES.has(state)) return pose
        return {
            ...pose,
            leftArmShoulder: {rx: WEAPON_READY_SHOULDER, ry: 0, rz: 0},
            leftArmElbow: {rx: WEAPON_READY_ELBOW, ry: 0, rz: 0},
            leftHandPivot: ZERO,
            leftWristPivot: ZERO,
            leftWeaponMount: GRIP_BONE_POSE,
        }
    }
    if (!HOLD_PERSISTENT_STATES.has(state)) return pose
    return {
        ...pose,
        leftArmShoulder: pose.rightArmShoulder,
        leftArmElbow: pose.rightArmElbow,
        leftHandPivot: pose.rightHandPivot,
        leftWristPivot: pose.rightWristPivot,
        leftWeaponMount: pose.rightWeaponMount,
    }
}

/**
 * 盾面朝向校正：把持盾臂的武器骨骼 X 转角设为「净转角 = `SHIELD_FACE_NET_X`」的值，
 * 使盾面法线（武器本地 +Y）水平指向角色前方。基础状态各关节仅绕 X 旋转，
 * 故净转角 ≈ 肩 + 肘 + 武器骨骼 X 之和，直接反解武器骨骼角即可（不改变手臂姿态）。
 * 应用于全部基础状态（待机 / 行走 / 格挡 / 瞬态），无论该臂是否处于持械戒备位。
 */
export const orientShieldArms = (
    pose: PoseState,
    shieldArms: readonly ('right' | 'left')[],
): PoseState => {
    if (shieldArms.length === 0) return pose
    let next = pose
    for (const arm of shieldArms) {
        const shoulder = arm === 'right' ? next.rightArmShoulder : next.leftArmShoulder
        const elbow = arm === 'right' ? next.rightArmElbow : next.leftArmElbow
        const mount: JointEulerState = {rx: SHIELD_FACE_NET_X - (shoulder.rx + elbow.rx), ry: 0, rz: 0}
        next = arm === 'right' ? {...next, rightWeaponMount: mount} : {...next, leftWeaponMount: mount}
    }
    return next
}

/** 各状态 clip 时长/循环（评审决议：循环 wrap / 非循环 clamp） */
