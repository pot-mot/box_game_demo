import type {Group, Mesh} from 'three'
import type {WeaponMeshConfig, WeaponLocalHitBox} from './weapon_mesh.ts'
import type {AttackPhaseName} from '../../../character/combat/attack_phases.ts'
import type {AttackSegment} from '../../../character/weapon/attack_chain.ts'
import type {HoldMode} from '../../../character/weapon/hold_mode.ts'
import type {BoxPartPalette} from '../../../render/box_parts.ts'

/** 角色配色 palette（方块人部件共享，见 render/box_parts） */
export type CharacterColorPalette = BoxPartPalette

/** 武器装配：主手（右手）必备，副手（左手）仅双持武器提供 */
export interface WeaponEquipConfig {
    /** 主手武器网格；undefined = 空手（卸下） */
    readonly main: WeaponMeshConfig | undefined
    /** 副手武器网格（双持）；undefined = 无副手武器 */
    readonly offhand?: WeaponMeshConfig
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
    /** 左腕动态关节（双持副手武器挂其下） */
    readonly leftWristPivot: Group

    /** 右手武器挂点（主手武器模型直接挂其下；可被动画驱动，控制武器朝向） */
    readonly rightWeaponMount: Group
    /** 左手武器挂点（副手武器/双手 IK 末端；可被动画驱动） */
    readonly leftWeaponMount: Group

    readonly rightLegHip: Group
    readonly rightThigh: Mesh
    readonly rightLegKnee: Group
    readonly rightShin: Mesh

    readonly leftLegHip: Group
    readonly leftThigh: Mesh
    readonly leftLegKnee: Group
    readonly leftShin: Mesh

    /** 装配武器（主手 + 可选副手，会先移除旧武器） */
    equipWeapon: (config: WeaponEquipConfig) => void

    /** 移除全部武器 */
    removeWeapon: () => void

    /** 当前武器命中检测标记点（null = 未装备），供 melee_executor 使用 */
    readonly weaponMesh: Mesh | null

    /** 当前武器刀尖采样点（null = 未装备），供刀光轨迹使用 */
    readonly weaponTip: Mesh | null

    /** 当前武器模型根节点（null = 未装备），命中箱 OBB 的世界变换来源 */
    readonly weaponGroup: Group | null

    /** 当前武器攻击判定箱本地盒参数（null = 未装备），略大于武器模型 */
    readonly weaponHitBox: WeaponLocalHitBox | null

    /** 原始几何中的主握把 Y 坐标（未装备 = 0），用于检视实际模型握点 */
    readonly weaponGripY: number
    /** 武器模型原点对齐主握把后，左手副握点沿本地 +Y 相对主握点的距离 */
    readonly weaponSupportGripOffset: number

    /** 副手（左手）武器命中检测标记点（null = 无双持） */
    readonly offhandWeaponMesh: Mesh | null
    /** 副手武器刀尖采样点（null = 无双持） */
    readonly offhandWeaponTip: Mesh | null
    /** 副手武器模型根节点（null = 无双持） */
    readonly offhandWeaponGroup: Group | null
    /** 副手武器攻击判定箱本地盒参数（null = 无双持） */
    readonly offhandWeaponHitBox: WeaponLocalHitBox | null

    /** 副手握把中心在武器本地 Y 轴上的坐标（无双持 = 0） */
    readonly offhandWeaponGripY: number

    /** 根据新调色板原地更新所有部位材质颜色（不重建几何体） */
    recolor: (palette: CharacterColorPalette) => void

    /** 释放所有几何体和材质 */
    dispose: () => void
}

/** 动画上下文，由 animation system 每帧传入（horizontalSpeed 用于行走步频变速与下落腿张开的体态随速度） */
export interface AnimationContext {
    readonly stateTime: number
    /** 水平速度（m/s）：行走播放变速（步频随速度）、falling 腿张开随速度 */
    readonly horizontalSpeed: number
    /** 当前持握模式（决定上半身姿态组合与双手/双持 IK 分支） */
    readonly holdMode: HoldMode
    /**
     * 当前攻击段（仅 attacking 状态有效）—— 武器模组拥有的段定义：
     * id 作为动画键（段切换触发姿态混合）、时长/恢复/阶段/tilt 供攻击 clip 生成器使用。
     */
    readonly attackSegment: AttackSegment | undefined
    /** 当前攻击阶段名（仅在 attacking 状态有效，其他状态为 undefined） */
    readonly attackPhase: AttackPhaseName | undefined
    /** 当前阶段进度 0-1（phaseTimer / phaseDuration） */
    readonly attackPhaseProgress: number
    /** 攻击总进度 0-1（attackTimer / totalDuration） */
    readonly attackTotalProgress: number
    /** 当前阶段索引（与 attackSegment.phases 配套，越界表示全部阶段已完成） */
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
