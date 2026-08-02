import type {Mesh, Group, LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {CharacterStateMachine} from './state_machine/types.ts'
import type { CombatComponent } from './combat/types.ts'
import type {PeaceSubStrategy} from './ai_strategy/types.ts'
import type {CombatSubStrategy} from './ai_strategy/types.ts'

export type {PeaceSubStrategy, CombatSubStrategy}

export interface CharacterConfig {
    speed: number
    jumpHeight: number
    radius: number
    height: number
}

export interface CharacterEntity {
    id: number
    config: CharacterConfig
    /** 碰撞体胶囊 mesh（edit 模式可见，play 模式隐藏） */
    mesh: Mesh
    /** 选中高亮线框（edit 模式） */
    wireframe: LineSegments | undefined
    /** 方块人外观 Group */
    appearanceGroup: Group
    body: Body
    isOnGround: boolean
    /** 地面接触法线（从地面指向角色，已归一化）。无地面接触时回退为 (0, 1, 0) */
    groundNormal: { readonly x: number; readonly y: number; readonly z: number }
    rowText: string

    isPlayer: boolean

    /** 和平策略（仅非玩家角色有效，默认 patrol） */
    peaceStrategy: PeaceSubStrategy
    /** 战斗策略（仅非玩家角色有效，默认 tactical） */
    combatStrategy: CombatSubStrategy

    /** 死亡动画计时（非持久状态） */
    isDying: boolean
    dyingTimer: number

    /** 冲刺冷却计时（秒，0 = 可用） */
    dashCooldownTimer: number

    combat: CombatComponent

    stateMachine: CharacterStateMachine
}

export type { Faction, AttackTendency, TendencyConfig } from './faction.ts'
export type { AttackConfig } from './archetypes.ts'
