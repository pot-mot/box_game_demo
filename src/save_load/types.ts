import type {BoxConfig, BoxEntityContext, CollisionRecord} from '../entity/box/types'
import type {AreaConfig, AreaEntityContext} from '../entity/area/types'
import type {BaseTerrainConfig, TerrainContext} from '../entity/terrain/base/types'
import type {BuildingGeneratorContext, BuildingWorldSaveData} from '../entity/building_generator/types/index.ts'
import type {InteractableConfig, InteractableContext} from '../entity/interactable/types.ts'
import type {ItemEntityContext} from '../entity/item/types.ts'
import type {InventorySaveData} from '../inventory/types.ts'
import type {FragmentConfig, FragmentEntityContext} from '../entity/fragment/common/types'
import type {CharacterEntitySystem} from '../entity/character/physics/world.ts'
import type {DefenseProfile} from '../character/combat/defense.ts'
import type {DamageTypeProfile} from '../character/combat/damage_type.ts'
import type {EquipmentState} from '../character/equipment/types.ts'
import type {LockPointConfig} from '../character/lock_point.ts'

/** 当前存档格式版本：v3 起 character 的攻击配置由「技能槽 attackSlot」改为「武器 + 数值覆写 attack」；
 *  v4 起 character 增加基础防御 defense 与护甲装备 armor；
 *  v5 起 character 增加额外锁定点 lockPoints；
 *  v6 起 character 增加副手武器 offhand；
 *  v7 起 character 增加肢体组件装备 limb；
 *  v7 起新增 building_generator 实体（显式压缩体素 block 数据，均为可选字段，旧档加载时安全回退默认）；
 *  v8 起新增 interactable / item 实体与 play 背包 inventory、传送点 teleports（modeInfo.play），均为可选，旧档安全回退；
 *  v10 起 character 增加惯用手 handedness（可选，旧档安全回退右撇子）；
 *  v11 起 character 增加行为原点策略 originStrategy、漫游间隔 originInterval、追击半径 chaseLeashRadius（均可选，旧档安全回退默认）；
 * v12 起 character 增加基础攻击加成 baseAttack（可选，旧档安全回退 0/0）；
 * v13 起 5 种箱子变体（box/common、box/destruction、box/burning、box/magnet、box/elasticity）合并为统一 `box` 实体
 *  （`config` 携带可选特性对象），旧的 `box/*` 元素在加载时作为未知类型按元素粒度跳过；
 * v14 起 `area/water` 统一为 `area` 实体（`config` 携带几何 + 视觉材质 + 可选物理场），
 *  旧的 `area/water` 元素在加载时作为未知类型按元素粒度跳过；
 * v15 起 character 增加 AI 反应式举盾窗口 aiBlockDuration、举盾冷却 aiBlockCooldown（均可选，旧档安全回退默认）；
 * v16 起 character 增加体形计划 bodyFormId（可选，缺省 / 未知 id 安全回退 humanoid）；
 * v17 起 character 增加吐息模组 breathModuleId（可选，未知 id 安全视为未装备）。
 * v18 起 character 改用 `bodyFormId + bodyState + equipment`（limb/weapon/armor 分层）：
 *  删除顶层 attack / offhand / holdMode / handedness / armor / limb / breathModuleId；
 *  天然武器不写入 equipment；旧版本文件在加载时按元素粒度跳过（不做字段迁移）。
 */
export const SAVE_FORMAT_VERSION = 18

/** JSON-safe 坐标三元组 */
export type Vec3JSON = [number, number, number]
/** JSON-safe 四元数 */
export type QuatJSON = [number, number, number, number]

/** 碎片凸包几何数据（JSON-safe 版 FragmentData） */
export interface FragmentDataJSON {
    renderVertices: number[]
    renderIndices: number[]
    hullVertices: Vec3JSON[]
    hullFaces: number[][]
    centroid: Vec3JSON
    massRatio: number
    boxSize: Vec3JSON
}

// ── 各实体类型的存档格式 ──

/** 统一箱子存档：刚体配置 + 各特性可选运行态（存在即该特性启用） */
export interface SavableBox {
    type: 'box'
    config: BoxConfig
    position: Vec3JSON
    quaternion: QuatJSON
    /** 可破坏特性运行态（生命 / 碰撞恢复数据） */
    destructible?: {
        health?: number
        collisions?: CollisionRecord[]
        collisionHistory?: CollisionRecord[]
        cooldowns?: [number, number][]
    }
    /** 燃烧特性运行态（生命） */
    burning?: {health?: number}
    /** 弹性特性运行态（形变 / 形变速度） */
    elastic?: {
        def: [number, number, number]
        vel: [number, number, number]
    }
}

export interface SavableArea {
    type: 'area'
    config: AreaConfig
    position: Vec3JSON
    quaternion: QuatJSON
}

export interface SavableTerrain {
    type: 'terrain'
    config: BaseTerrainConfig
    position: Vec3JSON
    quaternion: QuatJSON
    heights: number[][]
}

export interface SavableFragment {
    type: 'fragment/common'
    config: FragmentConfig
    position: Vec3JSON
    quaternion: QuatJSON
    data: FragmentDataJSON
}

/** 建筑生成器：显式体素数据（palette + 每 chunk Base64 RLE），与生成器代码版本解耦 */
export interface SavableBuildingGenerator {
    type: 'building_generator'
    worlds: BuildingWorldSaveData[]
}

/** 交互物：显式配置 + 运行态（进度 / 开关 / 容器内容 / 生命） */
export interface SavableInteractable {
    type: 'interactable'
    config: InteractableConfig
    position: Vec3JSON
    yawQuarter: number
    progress: number
    target: number
    on: boolean
    /** 容器内容（仅 chest；缺省 = 空容器） */
    container?: InventorySaveData
    health: number
}

/** 掉落物：物品定义 id + 数量 + 世界变换 */
export interface SavableItem {
    type: 'item'
    config: {defId: string; count: number}
    position: Vec3JSON
    quaternion: QuatJSON
}

export type SavableEntity = SavableBox | SavableArea | SavableTerrain
    | SavableFragment | SavableBuildingGenerator | SavableInteractable | SavableItem | SavableCharacter

// ── 角色 ──

export interface CharacterSaveConfig {
    speed: number
    jumpHeight: number
    scale: number
    /** 体形计划 id（基础模组）：缺省 / 未知 id 加载时安全回退 humanoid */
    bodyFormId?: string
    /** 体形专属状态（人形：holdMode / handedness；其他体形不携带这些键） */
    bodyState?: Readonly<Record<string, string>>
    /** 装备状态（limb / weapon / armor 分层；槽位键 = kind:bodyPart） */
    equipment?: EquipmentState
    peaceStrategy?: 'patrol' | 'build'
    combatStrategy?: 'tactical' | 'aggressive' | 'cowardly'
    tendency: {
        tendencyId: 'hostileAll' | 'hostileExceptSelf' | 'hostileTo' | 'hostileExcept' | 'pacifist'
        targetFactions?: number[]
    }
    faction: number
    maxHealth: number
    /** 基础防御（逐攻击类别固定减伤；缺省 = 0/0，旧存档无此字段时安全回退） */
    defense?: DefenseProfile
    /** 基础攻击加成（逐攻击类别，角色固有；缺省 = 0/0，旧存档无此字段时安全回退） */
    baseAttack?: DamageTypeProfile
    /** 额外锁定点（关节 id + 关节本地偏移；缺省 = 仅默认身体中心点，非法条目加载时安全剔除） */
    lockPoints?: LockPointConfig[]
    /** 韧性上界基础值（缺省 = 默认，旧存档无此字段时安全回退） */
    poiseMax?: number
    /** 受击后延迟开始回充（秒；缺省 = 默认，安全回退） */
    poiseRegenDelay?: number
    /** 韧性回充速率（/秒；缺省 = 默认，安全回退） */
    poiseRegenPerSec?: number
    /** 倒地时长（秒；缺省 = 默认，安全回退） */
    knockdownDuration?: number
    /** 起身时长（秒；缺省 = 默认，安全回退） */
    getUpDuration?: number
    isPlayer: boolean
    navEnabled?: boolean
    /**
     * 行为原点更新策略（持久化）：缺省 = resident（恒以初始原点为准）；
     * 旧存档无此字段时安全回退，非法值加载时安全丢弃。
     */
    originStrategy?: 'resident' | 'fighter' | 'hunter' | 'roamer'
    /** 漫游者原点更新间隔（秒）：缺省 = 20；旧存档无此字段时安全回退 */
    originInterval?: number
    /** 追击活动半径（m）：缺省 = 20；旧存档无此字段时安全回退 */
    chaseLeashRadius?: number
    /** AI 反应式举盾窗口时长（秒）：缺省 = 0.4；旧存档无此字段时安全回退 */
    aiBlockDuration?: number
    /** AI 反应式举盾冷却（秒）：缺省 = 1.2；旧存档无此字段时安全回退 */
    aiBlockCooldown?: number
}

export interface SavableCharacter {
    type: 'character'
    config: CharacterSaveConfig
    health: number
    position: Vec3JSON
    quaternion: QuatJSON
    /** 朝向角（度，0-360，0 = 世界 +Z 前方）；刚体 lockRotations 不参与旋转，朝向单独持久化 */
    facing?: number
}

// ── 模式信息（强类型嵌套）──

export interface CameraInfoJSON {
    position: Vec3JSON
    rotate: Vec3JSON
}

export interface ModeInfoJSON {
    edit?: {
        cameraInfo?: CameraInfoJSON
    }
    play?: {
        cameraInfo?: CameraInfoJSON
        /** 玩家背包（可选；旧档缺失 = 空背包） */
        inventory?: InventorySaveData
        /** 已解锁传送点键（可选；旧档缺失 = 未解锁） */
        teleports?: string[]
    }
    boneEdit?: {
        cameraInfo?: CameraInfoJSON
    }
}

/** 完整存档数据结构 */
export interface SaveData {
    /** 存档格式版本（缺省视为 v1：character 位置为身体中心，加载时迁移） */
    version?: number
    entities: SavableEntity[]
    modeInfo?: ModeInfoJSON
}

// ── 存档模块使用的实体源访问接口 ──

/** 存档/读档所需的最小实体结构 */
export interface SaveLoadEntry {
    id?: number
    config: unknown
    body?: { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } }
    mesh?: { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } }
    health?: number
    def?: [number, number, number]
    vel?: [number, number, number]
    heights?: number[][]
}

/** 存档模块使用的实体源访问接口 */
export interface SaveLoadSource {
    getAll(): ReadonlyArray<SaveLoadEntry>
    add(config: unknown, x: number, y: number, z: number, quat?: { x: number; y: number; z: number; w: number }): { id: number }
    remove(id: number): void
    setHealth?(id: number, health: number): void
    setHeights?(id: number, heights: number[][]): void
}

/** EntityType → 具体 Context 类型的强类型映射 */
export type EntitySourceMap = {
    'box': BoxEntityContext
    'area': AreaEntityContext
    'fragment/common': FragmentEntityContext
    'character': CharacterEntitySystem
    'terrain': TerrainContext
    'building_generator': BuildingGeneratorContext
    'interactable': InteractableContext
    'item': ItemEntityContext
}
