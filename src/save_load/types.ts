import type {CommonBoxConfig} from '../entity/box/common/types'
import type {DestructibleConfig} from '../entity/box/destructed/types'
import type {BurningBoxConfig} from '../entity/box/burning/types'
import type {MagnetBoxConfig} from '../entity/box/magnet/types'
import type {ElasticBoxConfig} from '../entity/box/elasticity/types'
import type {WaterBlockConfig} from '../entity/area/water/types'
import type {BaseTerrainConfig} from '../entity/terrain/base/types'
import type {FragmentConfig} from '../entity/fragment/common/types'
import type {GameMode} from '../modes/constants'

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
}

export interface SavableBurningBox {
    type: 'box/burning'
    config: BurningBoxConfig
    position: Vec3JSON
    quaternion: QuatJSON
    health: number
    burnProgress: number
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

export interface SavablePlayer {
    position: Vec3JSON
}

export type SavableEntity = SavableCommonBox | SavableDestructibleBox | SavableBurningBox
    | SavableMagnetBox | SavableElasticBox | SavableWaterBlock | SavableTerrain
    | SavableFragment

/** 完整存档数据结构 */
export interface SaveData {
    version: 1
    mode: GameMode
    entities: SavableEntity[]
    player?: SavablePlayer
}
