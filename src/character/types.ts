import type {Mesh} from 'three'
import type {Body} from 'cannon-es'
import type {Faction, AttackTendency, TendencyConfig} from './faction.ts'
import type {AttackConfig, BulletConfig} from './archetypes.ts'
import type {CharacterStateMachine} from './state_machine/types.ts'

export interface CharacterConfig {
    speed: number
    jumpHeight: number
    radius: number
    height: number
}

export interface CharacterEntity {
    id: number
    config: CharacterConfig
    mesh: Mesh
    body: Body
    isOnGround: boolean
    rowText: string

    isPlayer: boolean

    faction: Faction
    attackTendency: AttackTendency
    tendencyConfig: TendencyConfig
    attackSlot: AttackConfig
    bulletConfig: BulletConfig
    maxHealth: number
    health: number
    isDead: boolean

    stateMachine: CharacterStateMachine

    attackActive: boolean
    attackTimer: number
    attackCooldownTimer: number
    attackedTargets: Set<number>
    attackDirX: number
    attackDirZ: number
}

export type {BulletConfig} from './archetypes.ts'
export type {Faction, AttackTendency, TendencyConfig} from './faction.ts'
export type {AttackConfig} from './archetypes.ts'
