import type {CombatSubStrategy, CombatConfig} from '../../../character/ai_strategy/combat.ts'
import type {PeaceConfig, PeaceSubStrategy} from '../../../character/ai_strategy/peace.ts'
import type {BoxSpawnEntry} from '../../../character/ai_strategy/types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import type {CombatState} from './combat/types.ts'
import type {PeaceState} from './peace/types.ts'

export type {CombatSubStrategy, CombatConfig}
export type {PeaceSubStrategy, PeaceConfig}
export type {CombatState}
export type {PeaceState}

/** 箱子生成回调签名 */
export type SpawnBoxCallback = (entry: BoxSpawnEntry, x: number, y: number, z: number, size: {width: number; height: number; depth: number}) => void

/** AI 运行时上下文（扁平化，combat / peace 字段前缀区分） */
export interface AIContext {
    characterId: number
    spawnPoint: {x: number; y: number; z: number}

    /** 共享 */
    losChecker: LineOfSightChecker | null
    spawnBox?: SpawnBoxCallback

    /** 当前活跃的 FSM */
    activeFsm: 'peace' | 'combat'

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
