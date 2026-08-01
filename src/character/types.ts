import type {Mesh, Group} from 'three'
import type {Body} from 'cannon-es'
import type {CharacterStateMachine} from './state_machine/types.ts'
import type { CombatComponent } from './combat/types.ts'

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
    /** 方块人外观 Group */
    appearanceGroup: Group
    body: Body
    isOnGround: boolean
    rowText: string

    isPlayer: boolean

    /** 死亡动画计时（非持久状态） */
    isDying: boolean
    dyingTimer: number

    combat: CombatComponent

    stateMachine: CharacterStateMachine
}

export type { Faction, AttackTendency, TendencyConfig } from './faction.ts'
export type { AttackConfig } from './archetypes.ts'
