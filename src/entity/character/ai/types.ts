import type {CombatSubStrategy, CombatConfig} from '../../../character/ai_strategy/combat.ts'
import type {PeaceConfig, PeaceSubStrategy} from '../../../character/ai_strategy/peace.ts'
import type {BoxSpawnEntry} from '../../../character/ai_strategy/types.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import type {CombatState} from './combat/types.ts'
import type {PeaceState} from './peace/types.ts'
import type {NavRunContext, NavSensor} from './nav/types.ts'

export type {CombatSubStrategy, CombatConfig}
export type {PeaceSubStrategy, PeaceConfig}
export type {CombatState}
export type {PeaceState}

/** 箱子生成回调签名 */
export type SpawnBoxCallback = (entry: BoxSpawnEntry, x: number, y: number, z: number, size: {width: number; height: number; depth: number}) => void

/** AI 输入回调：移动方向 + 攻击意图 + 可选显式攻击方向（缺省取移动方向，供边逃边射等移动/攻击分离场景） */
export type AISetInput = (dx: number, dz: number, attack: boolean, attackDX?: number, attackDZ?: number) => void

/** 攻击检测箱检查器：目标是否在角色的攻击检测箱内（缺失时 AI 回退圆形距离判定） */
export type AttackDetectChecker = (character: CharacterEntity, target: CharacterEntity) => boolean

/** AI 运行时上下文（扁平化，combat / peace 字段前缀区分） */
export interface AIContext {
    characterId: number
    spawnPoint: {x: number; y: number; z: number}

    /** 共享 */
    losChecker: LineOfSightChecker | null
    spawnBox?: SpawnBoxCallback

    /** 导航感知子系统运行时上下文 */
    nav: NavRunContext

    /** 导航传感器（共享实例） */
    navSensor: NavSensor | null

    /** 攻击检测箱检查器（仅近战出招触发用，缺失时回退距离判定） */
    attackDetectChecker?: AttackDetectChecker

    /** 角色当前朝向角（rad）：视线扇形门控用，由 world.ts 注入 */
    getFacingAngle?: () => number

    /** 当前活跃的 FSM */
    activeFsm: 'peace' | 'combat'

    /* ── 静止检测（卡死自愈） ── */
    /** 连续"有移动意图但无位移"的累计时长（秒） */
    stallTimer: number
    /** 位移检测锚点（上次确认在动时的位置） */
    stallAnchorX: number
    stallAnchorZ: number
    /** 卡死放弃战斗后的重新接敌冷却（秒） */
    combatReentryTimer: number

    /* ── 战斗 FSM 状态 ── */
    combatState: CombatState
    combatStateTime: number
    combatTargetId: number | undefined
    combatStrafeDir: number
    combatStrafeTimer: number
    combatFleeDir: {x: number; z: number}
    combatBurstAttackCount: number
    combatStrategy: CombatSubStrategy
    combatConfig: CombatConfig

    /* ── 和平 FSM 状态 ── */
    peaceState: PeaceState
    peaceStateTime: number
    peaceConfig: PeaceConfig
    waypoint: {x: number; y: number; z: number}
    waitTimer: number
    buildTimer: number
}
