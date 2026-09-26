/**
 * 攻击动作的逐段关键帧修订：时间沿用各 clip 已有关键帧，不增加阶段或播放机制。
 * 欧拉角为关节局部 XYZ（弧度）；武器握把原点由 weapon_mesh.ts 按各模型几何单独校正。
 *
 * 动作结构（三段式，全部近战段统一）：
 * - t=0 起手/蓄力：武器在打击平面内的起始位（上举/后引/预备），与持械戒备位可平滑衔接；
 * - 中帧 = 打击完成姿态：刃/枪口位于打击平面内并指向打击方向，双手副握点在左臂臂展内；
 * - 末帧 = 持械戒备（肩 -0.45 / 肘 -0.85 / 挂点 1.7），与 idle/walking 一致，链段之间无跳变。
 * 武器骨骼（rightWeaponMount / leftWeaponMount）承担挥砍平面与刃面朝向；腕关节只做小幅甩腕。
 */
type JointPose = readonly [number, number, number]

interface AttackPoseEdit {
    readonly time: number
    readonly joints: Readonly<Record<string, JointPose>>
}

/** 持械戒备末帧（与 pose_fns.ts 的 idle 持械姿态一致） */
const READY = {
    rightArmShoulder: [-0.45, 0, 0],
    rightArmElbow: [-0.85, 0, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [1.7, 0, 0],
    leftArmShoulder: [0, 0, 0],
    leftArmElbow: [-0.1, 0, 0],
    leftWristPivot: [0, 0, 0],
    leftWeaponMount: [1.7, 0, 0],
    spine: [0, 0, 0],
} as const satisfies Readonly<Record<string, JointPose>>

export const ATTACK_POSE_EDITS: Readonly<Record<string, readonly AttackPoseEdit[]>> = {
    short_sword_light_1: [
        {time: 0, joints: {rightArmShoulder: [-2.072, -0.161, 1.453], rightArmElbow: [-1.909, 0, 0], rightWristPivot: [0.409, 0, 0], rightWeaponMount: [3.355, 0, 0], leftArmShoulder: [0.35, 0, -0.4], leftArmElbow: [-0.7, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.76, 0.098, 0.039], rightArmElbow: [-0.533, 0, 0], rightWristPivot: [0.031, 0, 0], rightWeaponMount: [3.061, 0, 0], leftArmShoulder: [0.12, 0, -0.15], leftArmElbow: [-0.35, 0, 0], spine: [0.3, 0, 0]}},
        {time: 0.533, joints: READY},
    ],
    short_sword_light_2: [
        {time: 0, joints: {rightArmShoulder: [0.462, 0.445, 0.385], rightArmElbow: [-0.207, 0, 0], rightWristPivot: [-0.033, 0, 0], rightWeaponMount: [1.053, 0, 0], leftArmShoulder: [-0.55, 0, 0.12], leftArmElbow: [-1.1, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-1.52, 0.212, -0.096], rightArmElbow: [-0.082, 0, 0], rightWristPivot: [-0.015, 0, 0], rightWeaponMount: [2.993, 0, 0], leftArmShoulder: [0.3, 0, -0.35], leftArmElbow: [-0.5, 0, 0], spine: [0.3, 0.1, 0]}},
        {time: 0.533, joints: READY},
    ],
    short_sword_heavy_1: [
        {time: 0, joints: {rightArmShoulder: [-1.919, 0.266, 1.473], rightArmElbow: [-1.027, 0, 0], rightWristPivot: [0.014, 0, 0], rightWeaponMount: [3.012, 0, 0], leftArmShoulder: [0.35, 0, -0.45], leftArmElbow: [-0.7, 0, 0], spine: [0.05, 0.15, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.084, -0.437, 0.73], rightArmElbow: [-1.708, 0, 0], rightWristPivot: [0.035, 0, 0], rightWeaponMount: [3.053, 0, 0], leftArmShoulder: [0.1, 0, 0.15], leftArmElbow: [-0.4, 0, 0], spine: [0.25, -0.25, 0]}},
        {time: 0.667, joints: READY},
    ],
    short_sword_heavy_2: [
        {time: 0, joints: {rightArmShoulder: [-2.055, 0.045, 1.468], rightArmElbow: [-0.876, 0, 0], rightWristPivot: [-0.008, 0, 0], rightWeaponMount: [2.99, 0, 0], leftArmShoulder: [0.35, 0, -0.45], leftArmElbow: [-0.7, 0, 0], spine: [0.05, 0.12, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.759, -0.42, -0.172], rightArmElbow: [-0.262, 0, 0], rightWristPivot: [-0.027, 0, 0], rightWeaponMount: [2.856, 0, 0], leftArmShoulder: [0.12, 0, 0.2], leftArmElbow: [-0.4, 0, 0], spine: [0.3, -0.2, 0]}},
        {time: 0.667, joints: READY},
    ],

    long_sword_light_1: [
        {time: 0, joints: {rightArmShoulder: [-2.161, -0.303, 1.454], rightArmElbow: [-1.584, 0, 0], rightWristPivot: [0.264, 0, 0], rightWeaponMount: [3.355, 0, 0], leftArmShoulder: [0.4, 0, -0.45], leftArmElbow: [-0.7, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.926, 0.102, 0.05], rightArmElbow: [-0.214, 0, 0], rightWristPivot: [-0.019, 0, 0], rightWeaponMount: [2.993, 0, 0], leftArmShoulder: [0.15, 0, -0.18], leftArmElbow: [-0.35, 0, 0], spine: [0.3, 0, 0]}},
        {time: 0.533, joints: READY},
    ],
    long_sword_light_2: [
        {time: 0, joints: {rightArmShoulder: [0.455, 0.449, 0.405], rightArmElbow: [-0.172, 0, 0], rightWristPivot: [-0.035, 0, 0], rightWeaponMount: [1.026, 0, 0], leftArmShoulder: [-0.6, 0, 0.15], leftArmElbow: [-1.15, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-1.527, 0.19, -0.089], rightArmElbow: [-0.103, 0, 0], rightWristPivot: [0.005, 0, 0], rightWeaponMount: [3, 0, 0], leftArmShoulder: [0.32, 0, -0.38], leftArmElbow: [-0.5, 0, 0], spine: [0.3, 0.1, 0]}},
        {time: 0.533, joints: READY},
    ],
    long_sword_heavy_1: [
        {time: 0, joints: {rightArmShoulder: [-2.062, 0.079, 1.478], rightArmElbow: [-0.656, 0, 0], rightWristPivot: [-0.024, 0, 0], rightWeaponMount: [2.937, 0, 0], leftArmShoulder: [0.4, 0, -0.5], leftArmElbow: [-0.7, 0, 0], spine: [0.05, 0.15, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.042, -0.455, 0.672], rightArmElbow: [-1.677, 0, 0], rightWristPivot: [0.018, 0, 0], rightWeaponMount: [3.015, 0, 0], leftArmShoulder: [0.12, 0, 0.18], leftArmElbow: [-0.4, 0, 0], spine: [0.25, -0.25, 0]}},
        {time: 0.667, joints: READY},
    ],
    long_sword_heavy_2: [
        {time: 0, joints: {rightArmShoulder: [-2.151, -0.081, 1.466], rightArmElbow: [-0.698, 0, 0], rightWristPivot: [-0.021, 0, 0], rightWeaponMount: [2.988, 0, 0], leftArmShoulder: [0.4, 0, -0.5], leftArmElbow: [-0.7, 0, 0], spine: [0.05, 0.12, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.822, -0.448, -0.169], rightArmElbow: [-0.171, 0, 0], rightWristPivot: [-0.035, 0, 0], rightWeaponMount: [2.823, 0, 0], leftArmShoulder: [0.14, 0, 0.22], leftArmElbow: [-0.4, 0, 0], spine: [0.3, -0.2, 0]}},
        {time: 0.667, joints: READY},
    ],

    heavy_sword_light_1: [
        {time: 0, joints: {rightArmShoulder: [-2.033, -0.226, -1.555], rightArmElbow: [-2.422, 0, 0], rightWristPivot: [0.246, 0, 0], rightWeaponMount: [3.357, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [0.107, 0.19, -0.839], rightArmElbow: [-1.557, 0, 0], rightWristPivot: [0.036, 0, 0], rightWeaponMount: [3.307, 0, 0], spine: [0.3, 0, 0]}},
        {time: 0.533, joints: READY},
    ],
    heavy_sword_light_2: [
        {time: 0, joints: {rightArmShoulder: [0.461, 0.129, 0.075], rightArmElbow: [-0.06, 0, 0], rightWristPivot: [-0.037, 0, 0], rightWeaponMount: [0.972, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.404, 0.111, -0.603], rightArmElbow: [-1.504, 0, 0], rightWristPivot: [0.021, 0, 0], rightWeaponMount: [3.257, 0, 0], spine: [0.3, 0.05, 0]}},
        {time: 0.533, joints: READY},
    ],
    heavy_sword_light_3: [
        {time: 0, joints: {rightArmShoulder: [0.457, 0.174, -0.442], rightArmElbow: [-1.336, 0, 0], rightWristPivot: [0.037, 0, 0], rightWeaponMount: [3.073, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.368, -0.212, -0.268], rightArmElbow: [-2.252, 0, 0], rightWristPivot: [-0.028, 0, 0], rightWeaponMount: [2.24, 0, 0], spine: [0.05, -0.1, 0]}},
        {time: 0.533, joints: READY},
    ],
    heavy_sword_heavy_1: [
        {time: 0, joints: {rightArmShoulder: [-1.197, 0.217, -0.565], rightArmElbow: [-2.456, 0, 0], rightWristPivot: [0, 0, 0], rightWeaponMount: [3.187, 0, 0], spine: [0.05, 0.2, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.127, -0.468, 0.213], rightArmElbow: [-1.486, 0, 0], rightWristPivot: [-0.021, 0, 0], rightWeaponMount: [2.978, 0, 0], spine: [0.25, -0.25, 0]}},
        {time: 0.667, joints: READY},
    ],
    heavy_sword_heavy_2: [
        {time: 0, joints: {rightArmShoulder: [-1.756, -0.027, -1.077], rightArmElbow: [-2.451, 0, 0], rightWristPivot: [0.157, 0, 0], rightWeaponMount: [3.349, 0, 0], spine: [0.05, 0.12, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.525, -0.317, -0.224], rightArmElbow: [-0.598, 0, 0], rightWristPivot: [-0.008, 0, 0], rightWeaponMount: [3, 0, 0], spine: [0.3, -0.2, 0]}},
        {time: 0.667, joints: READY},
    ],

    spear_light_1: [
        {time: 0, joints: {rightArmShoulder: [0.456, -0.446, -0.424], rightArmElbow: [-2.439, 0, 0], rightWristPivot: [0.032, 0, 0], rightWeaponMount: [3.101, 0, 0], spine: [0.1, 0.05, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.129, -0.301, -0.753], rightArmElbow: [-2.072, 0, 0], rightWristPivot: [0.025, 0, 0], rightWeaponMount: [3.262, 0, 0], spine: [0.32, 0.05, 0]}},
        {time: 0.533, joints: READY},
    ],
    spear_light_2: [
        {time: 0, joints: {rightArmShoulder: [0.462, 0.058, -0.433], rightArmElbow: [-2.462, 0, 0], rightWristPivot: [-0.01, 0, 0], rightWeaponMount: [3.136, 0, 0], spine: [0.1, -0.12, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.145, -0.208, -0.759], rightArmElbow: [-1.881, 0, 0], rightWristPivot: [0.026, 0, 0], rightWeaponMount: [3.166, 0, 0], spine: [0.3, -0.1, 0]}},
        {time: 0.533, joints: READY},
    ],
    spear_charge_thrust: [
        {time: 0, joints: {rightArmShoulder: [0.473, -0.456, -0.295], rightArmElbow: [-2.453, 0, 0], rightWristPivot: [0.01, 0, 0], rightWeaponMount: [3.087, 0, 0], spine: [0.05, 0.15, 0]}},
        {time: 0.6, joints: {rightArmShoulder: [-0.252, -0.265, -0.837], rightArmElbow: [-1.901, 0, 0], rightWristPivot: [0.03, 0, 0], rightWeaponMount: [3.15, 0, 0], spine: [0.4, 0.05, 0]}},
        {time: 1, joints: READY},
    ],
    spear_heavy_1: [
        {time: 0, joints: {rightArmShoulder: [-0.158, -0.46, -1.098], rightArmElbow: [-2.377, 0, 0], rightWristPivot: [0.026, 0, 0], rightWeaponMount: [3.108, 0, 0], spine: [0.1, 0.3, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.21, -0.452, -1.115], rightArmElbow: [-1.917, 0, 0], rightWristPivot: [0.179, 0, 0], rightWeaponMount: [3.357, 0, 0], spine: [0.25, -0.3, 0]}},
        {time: 0.667, joints: READY},
    ],
    spear_heavy_2: [
        {time: 0, joints: {rightArmShoulder: [-0.664, -0.461, -1.304], rightArmElbow: [-2.455, 0, 0], rightWristPivot: [0.144, 0, 0], rightWeaponMount: [3.356, 0, 0], spine: [0.05, 0.2, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [0.348, -0.179, -1.06], rightArmElbow: [-1.894, 0, 0], rightWristPivot: [0.031, 0, 0], rightWeaponMount: [3.336, 0, 0], spine: [0.3, -0.2, 0]}},
        {time: 0.667, joints: READY},
    ],

    dual_axe_light_1: [
        {time: 0, joints: {rightArmShoulder: [-1.903, 0.208, 1.573], rightArmElbow: [-1.119, 0, 0], rightWeaponMount: [2.988, 0, 0], leftArmShoulder: [-1.984, -0.133, -1.576], leftArmElbow: [-1.005, 0, 0], leftWeaponMount: [2.704, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.694, 0.139, -0.177], rightArmElbow: [-0.506, 0, 0], rightWeaponMount: [3.011, 0, 0], leftArmShoulder: [-1.5, -0.1, -1.15], leftArmElbow: [-0.9, 0, 0], leftWeaponMount: [2.85, 0, 0], spine: [0.25, 0.08, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.55, 0, 0.05], rightArmElbow: [-0.7, 0, 0], rightWeaponMount: [2.4, 0, 0], leftArmShoulder: [-0.612, 0.144, -0.247], leftArmElbow: [-0.551, 0, 0], leftWeaponMount: [3.019, 0, 0], spine: [0.15, -0.08, 0]}},
        {time: 0.533, joints: READY},
    ],
    dual_axe_light_2: [
        {time: 0, joints: {rightArmShoulder: [-2.111, 0.24, 1.488], rightArmElbow: [-1.191, 0, 0], rightWeaponMount: [3.041, 0, 0], leftArmShoulder: [-2.062, -0.222, -1.581], leftArmElbow: [-1.106, 0, 0], leftWeaponMount: [2.965, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.562, -0.086, 0.013], rightArmElbow: [-0.566, 0, 0], rightWeaponMount: [3, 0, 0], leftArmShoulder: [-1.6, -0.15, -1.1], leftArmElbow: [-0.9, 0, 0], leftWeaponMount: [2.85, 0, 0], spine: [0.25, -0.1, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.5, 0, -0.03], rightArmElbow: [-0.68, 0, 0], rightWeaponMount: [2.5, 0, 0], leftArmShoulder: [-0.667, 0.11, -0.005], leftArmElbow: [-0.291, 0, 0], leftWeaponMount: [2.964, 0, 0], spine: [0.15, 0.1, 0]}},
        {time: 0.533, joints: READY},
    ],
    dual_axe_heavy_1: [
        {time: 0, joints: {rightArmShoulder: [-1.926, 0.223, 1.572], rightArmElbow: [-0.945, 0, 0], rightWeaponMount: [2.904, 0, 0], leftArmShoulder: [-1.926, -0.223, -1.572], leftArmElbow: [-0.945, 0, 0], leftWeaponMount: [2.904, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.738, 0.123, -0.251], rightArmElbow: [-0.35, 0, 0], rightWeaponMount: [3, 0, 0], leftArmShoulder: [-1.55, -0.12, -1.2], leftArmElbow: [-0.85, 0, 0], leftWeaponMount: [2.85, 0, 0], spine: [0.3, 0.15, 0]}},
        {time: 0.533, joints: {rightArmShoulder: [-0.5, 0, 0.04], rightArmElbow: [-0.7, 0, 0], rightWeaponMount: [2.4, 0, 0], leftArmShoulder: [-0.478, 0.438, -0.316], leftArmElbow: [-0.583, 0, 0], leftWeaponMount: [2.986, 0, 0], spine: [0.18, -0.12, 0]}},
        {time: 0.667, joints: READY},
    ],
    dual_axe_heavy_2: [
        {time: 0, joints: {rightArmShoulder: [-1.926, 0.223, 1.572], rightArmElbow: [-0.945, 0, 0], rightWeaponMount: [2.904, 0, 0], leftArmShoulder: [-1.926, -0.223, -1.572], leftArmElbow: [-0.945, 0, 0], leftWeaponMount: [2.904, 0, 0], spine: [0.05, 0, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.738, 0.123, -0.251], rightArmElbow: [-0.35, 0, 0], rightWeaponMount: [3, 0, 0], leftArmShoulder: [-1.55, -0.12, -1.2], leftArmElbow: [-0.85, 0, 0], leftWeaponMount: [2.85, 0, 0], spine: [0.3, 0.15, 0]}},
        {time: 0.533, joints: {rightArmShoulder: [-0.5, 0, 0.04], rightArmElbow: [-0.7, 0, 0], rightWeaponMount: [2.4, 0, 0], leftArmShoulder: [-0.478, 0.438, -0.316], leftArmElbow: [-0.583, 0, 0], leftWeaponMount: [2.986, 0, 0], spine: [0.18, -0.12, 0]}},
        {time: 0.667, joints: READY},
    ],

    war_hammer_light_1: [
        {time: 0, joints: {rightArmShoulder: [-1.574, -0.301, -1.42], rightArmElbow: [-2.458, 0, 0], rightWristPivot: [0.14, 0, 0], rightWeaponMount: [3.351, 0, 0], spine: [0.05, 0.05, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.148, -0.455, -0.215], rightArmElbow: [-1.485, 0, 0], rightWristPivot: [0.281, 0, 0], rightWeaponMount: [3.357, 0, 0], spine: [0.3, 0.05, 0]}},
        {time: 0.533, joints: READY},
    ],
    war_hammer_light_2: [
        {time: 0, joints: {rightArmShoulder: [-1.416, -0.167, -1.555], rightArmElbow: [-2.459, 0, 0], rightWristPivot: [0.161, 0, 0], rightWeaponMount: [3.357, 0, 0], spine: [0.05, 0.12, 0]}},
        {time: 0.267, joints: {rightArmShoulder: [-0.332, -0.351, -0.49], rightArmElbow: [-1.006, 0, 0], rightWristPivot: [0.205, 0, 0], rightWeaponMount: [3.356, 0, 0], spine: [0.3, -0.15, 0]}},
        {time: 0.533, joints: READY},
    ],
    war_hammer_heavy_1: [
        {time: 0, joints: {rightArmShoulder: [-0.689, -0.164, -0.96], rightArmElbow: [-2.459, 0, 0], rightWristPivot: [-0.032, 0, 0], rightWeaponMount: [3.028, 0, 0], spine: [0.05, 0.2, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [-0.8, -0.3, -0.4], rightArmElbow: [-1.2, 0, 0], rightWristPivot: [0.05, 0, 0], rightWeaponMount: [3.2, 0, 0], spine: [0.25, -0.2, 0]}},
        {time: 0.667, joints: READY},
    ],
    war_hammer_heavy_2: [
        {time: 0, joints: {rightArmShoulder: [-1.719, -0.13, -1.557], rightArmElbow: [-2.242, 0, 0], rightWristPivot: [0.063, 0, 0], rightWeaponMount: [3.352, 0, 0], spine: [0.05, 0.1, 0]}},
        {time: 0.4, joints: {rightArmShoulder: [0.484, -0.376, -0.721], rightArmElbow: [-2.056, 0, 0], rightWristPivot: [0.442, 0, 0], rightWeaponMount: [3.355, 0, 0], spine: [0.25, -0.1, 0]}},
        {time: 0.667, joints: READY},
    ],

    longbow_shot: [
        {time: 0, joints: {rightArmShoulder: [0.415, -0.295, -0.511], rightArmElbow: [-2.26, 0, 0], rightWristPivot: [0.05, 0, 0], rightWeaponMount: [3.303, 0, 0], spine: [0.1, 0.05, 0]}},
        {time: 0.12, joints: {rightArmShoulder: [0.309, -0.329, -0.667], rightArmElbow: [-2.254, 0, 0], rightWristPivot: [0.037, 0, 0], rightWeaponMount: [3.352, 0, 0], spine: [0.15, 0.05, 0]}},
        {time: 0.24, joints: {rightArmShoulder: [0.121, -0.288, -0.902], rightArmElbow: [-2.17, 0, 0], rightWristPivot: [0.081, 0, 0], rightWeaponMount: [3.348, 0, 0], spine: [0.2, 0.05, 0]}},
        {time: 0.4, joints: READY},
    ],
    crossbow_bolt: [
        {time: 0, joints: {rightArmShoulder: [0.48, -0.088, -0.575], rightArmElbow: [-1.878, 0, 0], rightWristPivot: [0.121, 0, 0], rightWeaponMount: [3.351, 0, 0], spine: [0.05, 0.05, 0]}},
        {time: 0.09, joints: {rightArmShoulder: [0.475, -0.163, -0.758], rightArmElbow: [-1.973, 0, 0], rightWristPivot: [0.078, 0, 0], rightWeaponMount: [3.354, 0, 0], spine: [0.1, 0.05, 0]}},
        {time: 0.3, joints: READY},
    ],
    shotgun_blast: [
        {time: 0, joints: {rightArmShoulder: [0.455, -0.044, -0.99], rightArmElbow: [-1.955, 0, 0], rightWristPivot: [0.174, 0, 0], rightWeaponMount: [3.357, 0, 0], spine: [0.1, 0.05, 0]}},
        {time: 0.18, joints: {rightArmShoulder: [0.413, -0.157, -1.212], rightArmElbow: [-2.045, 0, 0], rightWristPivot: [0.133, 0, 0], rightWeaponMount: [3.355, 0, 0], spine: [0.15, 0.05, 0]}},
        {time: 0.6, joints: READY},
    ],
    staff_orb: [
        {time: 0, joints: {rightArmShoulder: [0.448, -0.314, -0.218], rightArmElbow: [-2.092, 0, 0], rightWristPivot: [-0.039, 0, 0], rightWeaponMount: [2.72, 0, 0], spine: [0.1, 0.05, 0]}},
        {time: 0.24, joints: {rightArmShoulder: [0.058, -0.355, -0.639], rightArmElbow: [-2.079, 0, 0], rightWristPivot: [0.027, 0, 0], rightWeaponMount: [3.107, 0, 0], spine: [0.2, 0.05, 0]}},
        {time: 0.6, joints: READY},
    ],
    magic_wand_homing: [
        {time: 0, joints: {rightArmShoulder: [0.455, -0.122, -0.375], rightArmElbow: [-2.059, 0, 0], rightWristPivot: [0.102, 0, 0], rightWeaponMount: [3.348, 0, 0], leftArmShoulder: [-0.25, 0, -0.15], leftArmElbow: [-0.5, 0, 0], spine: [0.1, 0.05, 0]}},
        {time: 0.09, joints: {rightArmShoulder: [0.394, -0.122, -0.775], rightArmElbow: [-2.074, 0, 0], rightWristPivot: [0.16, 0, 0], rightWeaponMount: [3.356, 0, 0], leftArmShoulder: [0.05, 0, -0.2], leftArmElbow: [-0.4, 0, 0], spine: [0.15, 0.05, 0]}},
        {time: 0.3, joints: READY},
    ],
    throwing_axe_hurl: [
        {time: 0, joints: {rightArmShoulder: [-2.184, -0.3, 1.565], rightArmElbow: [-1.243, 0, 0], rightWristPivot: [0.022, 0, 0], rightWeaponMount: [3.194, 0, 0], leftArmShoulder: [-0.5, 0, 0.2], leftArmElbow: [-0.9, 0, 0], spine: [0, -0.1, 0]}},
        {time: 0.15, joints: {rightArmShoulder: [-0.51, 0.258, -0.737], rightArmElbow: [-1.6, 0, 0], rightWristPivot: [0.256, 0, 0], rightWeaponMount: [3.357, 0, 0], leftArmShoulder: [0.3, 0, -0.3], leftArmElbow: [-0.4, 0, 0], spine: [0.25, 0.05, 0]}},
        {time: 0.5, joints: READY},
    ],
    grenade_throw: [
        {time: 0, joints: {rightArmShoulder: [-2.2, 0, 0.5], rightArmElbow: [-1.3, 0, 0], rightWristPivot: [0, 0, 0], rightWeaponMount: [3.0, 0, 0], leftArmShoulder: [-0.5, 0, 0.2], leftArmElbow: [-0.9, 0, 0], spine: [0, -0.1, 0]}},
        {time: 0.24, joints: {rightArmShoulder: [-0.086, 0.136, -1.554], rightArmElbow: [-1.872, 0, 0], rightWristPivot: [0.251, 0, 0], rightWeaponMount: [3.352, 0, 0], leftArmShoulder: [0.3, 0, -0.3], leftArmElbow: [-0.4, 0, 0], spine: [0.25, 0.05, 0]}},
        {time: 0.8, joints: READY},
    ],
    molotov_throw: [
        {time: 0, joints: {rightArmShoulder: [-2.2, 0, 0.5], rightArmElbow: [-1.4, 0, 0], rightWristPivot: [0, 0, 0], rightWeaponMount: [3.0, 0, 0], leftArmShoulder: [-0.5, 0, 0.2], leftArmElbow: [-0.9, 0, 0], spine: [0, -0.1, 0]}},
        {time: 0.24, joints: {rightArmShoulder: [-0.295, 0.135, -1.382], rightArmElbow: [-1.869, 0, 0], rightWristPivot: [0.244, 0, 0], rightWeaponMount: [3.358, 0, 0], leftArmShoulder: [0.3, 0, -0.3], leftArmElbow: [-0.4, 0, 0], spine: [0.25, 0.05, 0]}},
        {time: 0.8, joints: READY},
    ],
    throwing_dart_fling: [
        {time: 0, joints: {rightArmShoulder: [-0.684, 0.176, -0.487], rightArmElbow: [-1.459, 0, 0], rightWristPivot: [0.147, 0, 0], rightWeaponMount: [3.356, 0, 0], leftArmShoulder: [0.2, 0, -0.25], leftArmElbow: [-0.5, 0, 0], spine: [0.2, 0.05, 0]}},
        {time: 0.2, joints: READY},
    ],
}
