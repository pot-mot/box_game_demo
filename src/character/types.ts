import type {Mesh, Group, LineSegments} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {CharacterStateMachine} from './state_machine/types.ts'
import type {PeaceSubStrategy, CombatSubStrategy, OriginSubStrategy} from './ai_strategy/types.ts'

export type {PeaceSubStrategy, CombatSubStrategy, OriginSubStrategy}

export type {BodyState, CharacterConfig, CharacterState} from './state/types.ts'
import type {CharacterState} from './state/types.ts'

export interface CharacterEntity {
    /** 唯一权威数据存储；所有游戏数据读取 `entity.state.*`。 */
    readonly state: CharacterState
    /** 碰撞体胶囊 mesh（edit 模式可见，play 模式隐藏） */
    mesh: Mesh
    /** 选中高亮线框（edit 模式） */
    wireframe: LineSegments | undefined
    /** 方块人外观 Group */
    appearanceGroup: Group
    body: RAPIER.RigidBody
    /** 主碰撞体（= colliders[0]）：地面 / 分离等物理交互的主引用 */
    mainCollider: RAPIER.Collider
    /** 体形全部碰撞体（按体形计划 colliderLayout 顺序；质量由附加质量统一决定） */
    colliders: RAPIER.Collider[]
    /** 状态机逻辑对象（运行时句柄，不是 state 数据） */
    stateMachine: CharacterStateMachine
}

/** 当前有效移速 = 基础移速（config.speed）× 装备移速乘数；状态机全部移动速度统一由此推导 */
export const moveSpeedOf = (entity: CharacterEntity): number =>
    entity.state.config.speed * entity.state.combat.moveSpeedMultiplier

export type { Faction, AttackTendency, TendencyConfig } from './faction.ts'
export type { AttackConfig } from './archetypes.ts'
