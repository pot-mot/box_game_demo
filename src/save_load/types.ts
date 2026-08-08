import type {CommonBoxConfig, CommonEntityContext} from '../entity/box/common/types'
import type {DestructibleConfig, DestructionEntityContext, CollisionRecord} from '../entity/box/destructed/types'
import type {BurningBoxConfig, BurningEntityContext} from '../entity/box/burning/types'
import type {MagnetBoxConfig, MagnetEntityContext} from '../entity/box/magnet/types'
import type {ElasticBoxConfig, ElasticEntityContext} from '../entity/box/elasticity/types'
import type {WaterBlockConfig, WaterEntityContext} from '../entity/area/water/types'
import type {BaseTerrainConfig, TerrainContext} from '../entity/terrain/base/types'
import type {FragmentConfig, FragmentEntityContext} from '../entity/fragment/common/types'
import type {CharacterEntitySystem} from '../entity/character/physics/world.ts'

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

export interface SavableCommonBox {
    type: 'box/common'
    config: CommonBoxConfig
    position: Vec3JSON
    quaternion: QuatJSON
}

export interface SavableDestructibleBox {
    type: 'box/destruction'
    config: DestructibleConfig
    position: Vec3JSON
    quaternion: QuatJSON
    health: number
    collisions?: CollisionRecord[]
    collisionHistory?: CollisionRecord[]
    cooldowns?: [number, number][]
}

export interface SavableBurningBox {
    type: 'box/burning'
    config: BurningBoxConfig
    position: Vec3JSON
    quaternion: QuatJSON
    health: number
}

export interface SavableMagnetBox {
    type: 'box/magnet'
    config: MagnetBoxConfig
    position: Vec3JSON
    quaternion: QuatJSON
}

export interface SavableElasticBox {
    type: 'box/elasticity'
    config: ElasticBoxConfig
    position: Vec3JSON
    quaternion: QuatJSON
    def: [number, number, number]
    vel: [number, number, number]
}

export interface SavableWaterBlock {
    type: 'area/water'
    config: WaterBlockConfig
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

export type SavableEntity = SavableCommonBox | SavableDestructibleBox | SavableBurningBox
    | SavableMagnetBox | SavableElasticBox | SavableWaterBlock | SavableTerrain
    | SavableFragment | SavableCharacter

// ── 角色 ──

export interface CharacterSaveConfig {
    speed: number
    jumpHeight: number
    scale: number
    peaceStrategy?: 'patrol' | 'build'
    combatStrategy?: 'tactical' | 'aggressive' | 'cowardly'
    attackSlot: {
        type: 'melee'
        weaponId?: string
        range: number; damage: number; cooldown: number; duration: number
    } | {
        type: 'ranged'
        weaponId?: string
        range: number; damage: number; cooldown: number; duration: number
        bulletSpeed: number; bulletKnockback: number; bulletLifetime: number
    }
    tendency: {
        tendencyId: 'hostileAll' | 'hostileExceptSelf' | 'hostileTo' | 'hostileExcept' | 'pacifist'
        targetFactions?: number[]
    }
    faction: number
    maxHealth: number
    isPlayer: boolean
}

export interface SavableCharacter {
    type: 'character'
    config: CharacterSaveConfig
    health: number
    position: Vec3JSON
    quaternion: QuatJSON
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
    }
}

/** 完整存档数据结构 */
export interface SaveData {
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
    'box/common': CommonEntityContext
    'box/destruction': DestructionEntityContext
    'box/burning': BurningEntityContext
    'box/magnet': MagnetEntityContext
    'box/elasticity': ElasticEntityContext
    'area/water': WaterEntityContext
    'fragment/common': FragmentEntityContext
    'character': CharacterEntitySystem
    'terrain': TerrainContext
}
