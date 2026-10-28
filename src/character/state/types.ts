import type {BodyEnvironment} from '../../physics/environment.ts'
import type {CombatComponent} from '../combat/types.ts'
import type {HurtBlockProfile, WorldHurtBlock} from '../hurt_blocks.ts'
import type {LockPointConfig} from '../lock_point.ts'
import type {CharacterStateName} from '../state_machine/state_names.ts'
import type {CombatSubStrategy, OriginSubStrategy, PeaceSubStrategy} from '../ai_strategy/types.ts'
import type {Handedness} from '../handedness.ts'
import type {HoldMode} from '../weapon/hold_mode.ts'
import type {CharacterStaminaState, StaminaConfig} from '../stamina/types.ts'

/**
 * 体形专属状态（不透明键值）：通用层只负责持久化与传递，
 * 只有对应体形分包解释其键（通用 `attackModule` + 人形 `handedness`）。
 */
export type BodyState = Readonly<Record<string, string>>

export interface CharacterConfig {
    speed: number
    jumpHeight: number
    /** 整体缩放（碰撞箱和模型等比缩放） */
    scale: number
    /** 体形计划 id（基础模组，缺省 = humanoid）：决定骨架 / 外观 / 碰撞布局 / 受击子块 / 装备槽 / 武器策略 */
    bodyFormId?: string
    /** 体形专属状态（通用：attackModule；人形额外：handedness） */
    bodyState?: BodyState
    /** 韧性上限基础值（缺省 = 常量 `DEFAULT_POISE_MAX`；有效上限再叠加装备加成） */
    poiseMax?: number
    /** 受击后韧性停止回充的延迟（秒，缺省 = 常量 `DEFAULT_POISE_REGEN_DELAY`） */
    poiseRegenDelay?: number
    /** 延迟结束后每秒回充的韧性值（缺省 = 常量 `DEFAULT_POISE_REGEN_PER_SEC`） */
    poiseRegenPerSec?: number
    /** 倒地状态持续时间（秒，缺省 = 常量 `DEFAULT_KNOCKDOWN_DURATION`） */
    knockdownDuration?: number
    /** 起身状态持续时间（秒，缺省 = 常量 `DEFAULT_GET_UP_DURATION`） */
    getUpDuration?: number
    /** 是否允许飞行（缺省 false；新建角色默认不允许，可在角色面板开启） */
    flightEnabled?: boolean
    /** 体力基础配置（缺省 = 常量默认值；有效消耗 / 恢复再乘装备修正） */
    stamina?: StaminaConfig
}

/** 状态机数据：只存数据，不存状态机逻辑对象 */
export interface CharacterStateMachineData {
    currentState: CharacterStateName
    previousState: CharacterStateName | null
    stateTime: number
}

export const createCharacterStateMachineData = (): CharacterStateMachineData => ({
    currentState: 'idle',
    previousState: null,
    stateTime: 0,
})

/** 物理量（由物理步写入；state 为权威） */
export interface CharacterPhysicsState {
    isOnGround: boolean
    /** 地面接触法线（从地面指向角色，已归一化）。无地面接触时回退为 (0, 1, 0) */
    groundNormal: {readonly x: number; readonly y: number; readonly z: number}
    /** 郊狼时间计时（秒）：最近一次真实接触至今，宽限期内仍判定为着地 */
    groundKeepTimer: number
    /** 本帧真实接触中被判定为「支撑」的刚体 handle（无真实接触 = null/undefined） */
    groundBodyHandle?: number | null
    /** 连续悬空计时（秒）：shouldFall 持续时长，达到阈值才允许进入 falling */
    airborneTime: number
    /** 连续支撑计时（秒）：可恢复支撑持续时长，达到阈值才允许退出 falling */
    groundedTime: number
}

/** AI 数据（由 AI / 面板写入） */
export interface CharacterAiState {
    /** 该角色的 AI 是否启用（false = 停止 AI 输入并保持静止；不影响全局 AI 系统开关） */
    aiEnabled: boolean
    navEnabled: boolean
    peaceStrategy: PeaceSubStrategy
    combatStrategy: CombatSubStrategy
    originStrategy: OriginSubStrategy
    originInterval: number
    chaseLeashRadius: number
    aiBlockDuration: number
    aiBlockCooldown: number
}

/** 死亡 / 倒地计时与方向 */
export interface CharacterTimersState {
    isDying: boolean
    dyingTimer: number
    dyingFallDirX: number
    dyingFallDirZ: number
    dyingFallAngle: number
    knockdownFallDirX: number
    knockdownFallDirZ: number
    knockdownFallAngle: number
}

/** 交互悬停目标 */
export interface CharacterInteractionState {
    active: boolean
    targetX: number
    targetZ: number
}

/**
 * 动画参数：由 state 的所有者写入，骨骼/动画只读。
 * 具体字段随动画组合迁移逐步补齐；已有字段必须先落到 state。
 */
export interface CharacterAnimationParams {
    horizontalSpeed: number
    verticalSpeed: number
    turnRate: number
    aimDirection: {readonly x: number; readonly y: number; readonly z: number}
    facingYaw: number
    attackCharge: number
    attackTotalProgress: number
    stateProgress: number
    holdMode?: HoldMode
    handedness?: Handedness
    weaponClassId?: string
    shieldHands?: Readonly<{main: boolean; off: boolean}>
}

/** 动画当前信息：由动画系统写入，供 UI / AI / 调试读取 */
export interface CharacterAnimationCurrent {
    graphId: string | null
    rootProgress: number
    layerWeights: Readonly<Record<string, number>>
}

export interface CharacterAnimationState {
    params: CharacterAnimationParams
    current: CharacterAnimationCurrent
}

/**
 * 角色唯一权威数据存储。
 * 引擎句柄（Rapier body / Three 对象）不在此接口内，放在 CharacterRuntime。
 */
/** 生成参数：由 `BodyForm.createState` 实现消费，生产代码统一经此构造 state */
export interface CharacterStateInit {
    readonly id: number
    readonly config: CharacterConfig
    readonly isPlayer: boolean
    readonly bodyState: BodyState
    readonly combat: CombatComponent
    readonly stateMachine: CharacterStateMachineData
    readonly environment: BodyEnvironment
    readonly ai: CharacterAiState
    readonly physics?: Partial<CharacterPhysicsState>
    readonly lockPoints?: readonly LockPointConfig[]
    readonly hurtProfile?: HurtBlockProfile
    readonly hurtBlocks?: WorldHurtBlock[]
    readonly rowText?: string
}

export interface CharacterState {
    readonly identity: {
        readonly id: number
        isPlayer: boolean
        rowText: string
    }
    config: CharacterConfig
    bodyState: BodyState
    combat: CombatComponent
    /** 体力运行时（当前值 / 有效消耗 / 恢复 / 计时；唯一权威存储） */
    stamina: CharacterStaminaState
    stateMachine: CharacterStateMachineData
    physics: CharacterPhysicsState
    ai: CharacterAiState
    timers: CharacterTimersState
    interaction: CharacterInteractionState
    environment: BodyEnvironment
    lockPoints: readonly LockPointConfig[]
    hurtProfile?: HurtBlockProfile
    hurtBlocks?: WorldHurtBlock[]
    animation: CharacterAnimationState
}
