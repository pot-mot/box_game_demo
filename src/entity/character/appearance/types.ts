import type {Group, Mesh} from 'three'
import type { WeaponMeshConfig, WeaponLocalHitBox } from './weapon_mesh.ts'
import type { AttackPhase, AttackPhaseName } from '../../../character/combat/attack_phases.ts'

/** 角色配色 palette */
export interface CharacterColorPalette {
    readonly skinColor: number
    readonly hairColor: number
    readonly bodyColor: number
    readonly legColor: number
}

/** 方块人外观模型，暴露所有关节 pivot 供动画系统直接操纵 */
export interface CharacterModel {
    readonly group: Group

    /** 躯干关节（髋部 pivot）：旋转带动 躯干+双臂+头（拧腰/前倾动力链） */
    readonly spine: Group

    readonly headNeck: Group
    readonly head: Mesh

    readonly body: Mesh

    readonly rightArmShoulder: Group
    readonly rightUpperArm: Mesh
    readonly rightArmElbow: Group
    readonly rightForearm: Mesh
    readonly rightHandPivot: Group
    /** 右腕动态关节（动画器驱动刃面朝向/攻击对齐，静止时为单位变换，武器挂其下） */
    readonly rightWristPivot: Group

    readonly leftArmShoulder: Group
    readonly leftUpperArm: Mesh
    readonly leftArmElbow: Group
    readonly leftForearm: Mesh
    readonly leftHandPivot: Group

    readonly rightLegHip: Group
    readonly rightThigh: Mesh
    readonly rightLegKnee: Group
    readonly rightShin: Mesh

    readonly leftLegHip: Group
    readonly leftThigh: Mesh
    readonly leftLegKnee: Group
    readonly leftShin: Mesh

    /** 切换武器（传入武器 mesh 配置，会先移除旧武器） */
    equipWeapon: (meshConfig: WeaponMeshConfig) => void

    /** 移除当前武器 */
    removeWeapon: () => void

    /** 当前武器命中检测标记点（null = 未装备），供 melee_executor 使用 */
    readonly weaponMesh: Mesh | null

    /** 当前武器刀尖采样点（null = 未装备），供刀光轨迹使用 */
    readonly weaponTip: Mesh | null

    /** 当前武器模型根节点（null = 未装备），命中箱 OBB 的世界变换来源 */
    readonly weaponGroup: Group | null

    /** 当前武器攻击判定箱本地盒参数（null = 未装备），略大于武器模型 */
    readonly weaponHitBox: WeaponLocalHitBox | null

    /** 当前武器静态握持前倾角 rx（rad，未装备 = 0），供动画器攻击时对齐抵消 */
    readonly weaponGripTilt: number

    /** 根据新调色板原地更新所有部位材质颜色（不重建几何体） */
    recolor: (palette: CharacterColorPalette) => void

    /** 释放所有几何体和材质 */
    dispose: () => void
}

/** 动画上下文，由 animation system 每帧传入 */
export interface AnimationContext {
    readonly stateTime: number
    readonly horizontalSpeed: number
    /** 累计水平位移（m）：由动画系统按平滑速度积分，单调递增，供位移驱动动画使用 */
    readonly horizontalTravel: number
    /** 近战挥砍倾斜角（rad），0=垂直砍，±PI/2=横砍 */
    readonly swingTilt: number
    /** 当前攻击技能 id（仅 attacking 状态有效）— 链段切换时作为动画键触发姿态混合 */
    readonly attackSkillId: string | undefined
    /** 当前攻击阶段名（仅在 attacking 状态有效，其他状态为 undefined） */
    readonly attackPhase: AttackPhaseName | undefined
    /** 当前阶段进度 0-1（phaseTimer / phaseDuration） */
    readonly attackPhaseProgress: number
    /** 攻击总进度 0-1（attackTimer / totalDuration） */
    readonly attackTotalProgress: number
    /** 当前技能的完整阶段序列（仅 attacking 状态有效，其他状态为 undefined）— 供动画器做相邻阶段姿态衔接 */
    readonly attackPhases: readonly AttackPhase[] | undefined
    /** 当前阶段索引（与 attackPhases 配套，越界表示全部阶段已完成） */
    readonly attackPhaseIndex: number
    /** 是否持有武器（idle/walking 据此降低持械臂摆幅） */
    readonly weaponHeld: boolean
}

/** 单个状态的动画处理器 */
export interface AnimationHandler {
    enter: (model: CharacterModel, ctx: AnimationContext) => void
    update: (dt: number, model: CharacterModel, ctx: AnimationContext) => void
    exit: (model: CharacterModel, ctx: AnimationContext) => void
}
