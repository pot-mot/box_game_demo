import type {Mesh, Group, LineSegments} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {CharacterStateMachine} from './state_machine/types.ts'
import type { CombatComponent } from './combat/types.ts'
import type { HoldMode } from './weapon/hold_mode.ts'
import type {PeaceSubStrategy} from './ai_strategy/types.ts'
import type {CombatSubStrategy} from './ai_strategy/types.ts'

export type {PeaceSubStrategy, CombatSubStrategy}

export interface CharacterConfig {
    speed: number
    jumpHeight: number
    /** 整体缩放（碰撞箱和模型等比缩放） */
    scale: number
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
    body: RAPIER.RigidBody
    mainCollider: RAPIER.Collider
    isOnGround: boolean
    /** 地面接触法线（从地面指向角色，已归一化）。无地面接触时回退为 (0, 1, 0) */
    groundNormal: { readonly x: number; readonly y: number; readonly z: number }
    /** 郊狼时间计时（秒）：最近一次真实接触至今，宽限期内仍判定为着地 */
    groundKeepTimer: number
    /** 连续悬空计时（秒）：shouldFall 持续时长，达到阈值才允许进入 falling（防下坡弹跳误触发） */
    airborneTime: number
    /** 连续支撑计时（秒）：可恢复支撑持续时长，达到阈值才允许退出 falling */
    groundedTime: number
    rowText: string

    isPlayer: boolean

    /** 导航感知开关（默认 true，面板可动态切换） */
    navEnabled: boolean

    /** 和平策略（仅非玩家角色有效，默认 patrol） */
    peaceStrategy: PeaceSubStrategy
    /** 战斗策略（仅非玩家角色有效，默认 tactical） */
    combatStrategy: CombatSubStrategy

    /** 死亡动画计时（非持久状态） */
    isDying: boolean
    dyingTimer: number
    /** 死亡倒向（世界水平单位向量，由死亡 state 依据最后受击冲击方向写入；无受击记录时默认向后倒） */
    dyingFallDirX: number
    dyingFallDirZ: number
    /** 死亡倒下角度（rad，0 → π/2，由死亡 state 按缓动推进；世界层据此绕「上 × 倒向」轴合成根旋转） */
    dyingFallAngle: number

    combat: CombatComponent

    /**
     * 当前持握模式（持久化状态，非每帧推导）：由 `setHoldMode` 切换，
     * 换武器时重置为该武器支持的首个模式。动画系统按它选择上半身姿态与双手 IK。
     */
    holdMode: HoldMode

    stateMachine: CharacterStateMachine
}

export type { Faction, AttackTendency, TendencyConfig } from './faction.ts'
export type { AttackConfig } from './archetypes.ts'
