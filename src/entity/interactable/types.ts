import type {SurfaceMaterialId} from '../../render/materials/index.ts'
import type {EntityInfoSource} from '../box/base/types/entity_info.ts'
import type {InteractionTarget} from '../../character/interaction/types.ts'
import type {WorldDamageTarget} from '../../character/combat/world_targets.ts'
import type {InventoryState, InventorySaveData} from '../../inventory/types.ts'
import type {InteractableKind, BreakableSource} from './kinds.ts'

/** 交互物基础配置（可存档） */
export interface InteractableBaseConfig {
    kind: InteractableKind
    /** 外观材质 */
    material: SurfaceMaterialId
    /** 视觉 / 碰撞尺寸 [宽, 高, 深]（米） */
    size: [number, number, number]
    /** 信号通道：开关发布、门 / 闸门 / 升降梯订阅；空串 = 不联动 */
    channel: string
}

export interface SavePointConfig extends InteractableBaseConfig {
    kind: 'save_point'
    name: string
}
export interface TeleportConfig extends InteractableBaseConfig {
    kind: 'teleport'
    name: string
}
export interface SwitchConfig extends InteractableBaseConfig {
    kind: 'switch'
    mode: 'toggle' | 'momentary'
}
export interface PushDoorConfig extends InteractableBaseConfig {
    kind: 'push_door_single' | 'push_door_double'
    /** 开门方向（绕竖轴的 90° 偏航）：0..3 */
    hingeQuarter: number
}
export interface GateConfig extends InteractableBaseConfig {
    kind: 'gate'
    /** 闸门垂直行程（米） */
    travel: number
    /** 移动速度（米/秒） */
    speed: number
}
export interface ChestConfig extends InteractableBaseConfig {
    kind: 'chest'
    /** 容量（物品实例个数上限） */
    capacity: number
}
export interface ElevatorConfig extends InteractableBaseConfig {
    kind: 'elevator'
    travel: number
    speed: number
}
export interface BreakableConfig extends InteractableBaseConfig {
    kind: 'breakable'
    health: number
    /** 可破坏本道具的攻击来源类别；命中不在列表内则无伤害 */
    breakableBy: readonly BreakableSource[]
}

export type InteractableConfig =
    | SavePointConfig
    | TeleportConfig
    | SwitchConfig
    | PushDoorConfig
    | GateConfig
    | ChestConfig
    | ElevatorConfig
    | BreakableConfig

/** 单个交互物实例（运行时） */
export interface InteractableEntity {
    id: number
    config: InteractableConfig
    /** 视觉根（含可动子节点） */
    group: import('three').Group
    body: import('@dimforge/rapier3d-compat').RigidBody
    colliders: import('@dimforge/rapier3d-compat').Collider[]
    /** 动画进度 0..1（门扇开合 / 闸门升降 / 升降梯行程） */
    progress: number
    /** 目标进度（0 = 关/下，1 = 开/上） */
    target: number
    /** 开关当前状态 */
    on: boolean
    /** 容器内容（chest）：独立格位背包（俄罗斯方块布局）；其它类型为空背包 */
    container: InventoryState
    /** 生命（breakable） */
    health: number
    dead: boolean
    /** 本帧信号发布（momentary 释放用） */
    momentaryTimer: number
    /** 世界基准位置（闸门 / 升降梯的行程原点） */
    readonly base: {x: number; y: number; z: number}
    /** 上一帧动作进度（升降梯载客计算位移用） */
    lastProgress: number
    /** 外观资源释放（只释放几何 / 本地材质；共享表面材质不释放） */
    meshDispose: () => void
    rowText: string
}

/** 玩家访问钩子（由 play 侧注入，交互物领域不依赖角色系统） */
export interface InteractablePlayerAccess {
    readPosition: () => {x: number; y: number; z: number} | undefined
    isGrounded: () => boolean
    /** 平移玩家（升降梯载客） */
    translate: (dx: number, dy: number, dz: number) => void
}

/** 跨领域动作钩子 */
export interface InteractableHooks {
    onSavePoint?: (e: InteractableEntity) => void
    onTeleport?: (e: InteractableEntity) => void
    onOpenChest?: (e: InteractableEntity) => void
    onBreak?: (e: InteractableEntity) => void
}

/** 行为运行期上下文 */
export interface InteractableRuntimeContext {
    setSignal: (channel: string, on: boolean) => void
    player: InteractablePlayerAccess | undefined
    hooks: InteractableHooks
    despawn: (id: number) => void
}

/** 交互物存档条目（显式字段，避免序列化本地引用） */
export interface InteractableSaveEntry {
    config: InteractableConfig
    position: [number, number, number]
    yawQuarter: number
    progress: number
    target: number
    on: boolean
    /** 容器内容（仅 chest 有意义；缺省 = 空容器） */
    container?: InventorySaveData
    health: number
}

/** 交互物实体系统公开接口（注册进 main.ts 的 systems，并作为交互提供者接入 play） */
export interface InteractableContext extends EntityInfoSource {
    add: (config: InteractableConfig, x: number, y: number, z: number, yawQuarter?: number) => {id: number}
    /** 主动激活（edit 面板 / 触发按钮） */
    activate: (id: number) => boolean
    setSignal: (channel: string, on: boolean) => void
    setHooks: (hooks: InteractableHooks) => void
    setPlayerAccess: (player: InteractablePlayerAccess | undefined) => void
    /** 每帧行为推进（由 preSync 调用） */
    update: (dt: number) => void
    /** 实体 tick：推进行为（注册进 main.ts systems 后由物理循环调用） */
    preSync: (dt: number, time: number) => void
    getAll: () => readonly InteractableEntity[]
    getById: (id: number) => InteractableEntity | undefined
    /** 交互提供者实现：收集当前玩家附近可交互目标 */
    collectInteractionTargets: (actorX: number, actorY: number, actorZ: number, out: InteractionTarget[]) => number
    /** 交互提供者实现：按目标键激活 */
    activateInteraction: (key: string) => boolean
    /** 可破坏道具目标提供（供战斗执行器查询） */
    collectBreakableTargets: () => readonly WorldDamageTarget[]
    getSave: () => InteractableSaveEntry[]
    loadSave: (entries: readonly InteractableSaveEntry[]) => void
}


