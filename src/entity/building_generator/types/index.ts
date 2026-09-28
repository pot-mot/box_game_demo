import type {Camera, Group, Raycaster} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {EntityInfoSource} from '../../box/base/types/entity_info.ts'
import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import type {ChunkStore} from '../grid/block_world.ts'
import type {BuildingConfig} from '../validation.ts'
import type {BuildingPropKind} from '../props/kinds.ts'

export type {BuildingConfig} from '../validation.ts'
export {BuildingConfigSchema} from '../validation.ts'

/** 单个 chunk 的存档数据（key 为 chunk 坐标，rle 为 Base64 RLE） */
export interface BuildingChunkSaveData {
    key: [number, number, number]
    rle: string
}

/** 自由道具（非体素装饰件）：局部坐标 + 四分之一圈偏航 */
export interface BuildingProp {
    kind: BuildingPropKind
    material: SurfaceMaterialId
    position: [number, number, number]
    yawQuarter: number
}

/** 单个建筑世界（一个体素网格区域）的存档数据 */
export interface BuildingWorldSaveData {
    origin: [number, number, number]
    yawQuarter: number
    /** 调色板：RLE 值（1 起）对应的材质 id；0 恒为空 */
    palette: SurfaceMaterialId[]
    chunks: BuildingChunkSaveData[]
    props: BuildingProp[]
}

/** 一个建筑世界（= 面板中的一个实体）：体素网格 + 渲染 / 物理句柄 */
export interface BuildingWorld {
    id: number
    config: BuildingConfig
    readonly group: Group
    readonly body: RAPIER.RigidBody
    readonly chunks: ChunkStore
    /** 自由道具数据 */
    readonly props: BuildingProp[]
    /** 自由道具网格容器（挂在 group 下，随世界变换） */
    readonly propGroup: Group
    /** 待重建网格的 chunk 键 */
    readonly dirty: Set<string>
    /** 待重建碰撞体的 chunk 键 */
    readonly colliderDirty: Set<string>
    yawQuarter: number
    rowText: string
}

/** 体素拾取结果（局部体素坐标 + 轴对齐面法线） */
export interface BlockPick {
    worldId: number
    block: [number, number, number]
    normal: [number, number, number]
}

export interface BuildingGeneratorContext extends EntityInfoSource {
    add: (config: BuildingConfig, x: number, y: number, z: number) => BuildingWorld
    getSelected: () => BuildingWorld | undefined
    getAll: () => BuildingWorld[]
    /** 应用新配置：按配方 / 种子 / 尺寸重建该世界体素（保留世界 id 与自由道具） */
    updateConfig: (id: number, config: BuildingConfig) => void
    /** 手动写入 / 清除体素（局部坐标；material 省略表示清除） */
    setBlock: (id: number, x: number, y: number, z: number, material?: SurfaceMaterialId) => void
    /** 读取体素材质（空返回 undefined） */
    getBlockMaterial: (id: number, x: number, y: number, z: number) => SurfaceMaterialId | undefined
    /** 区域填充：以两角点（含）定义长方体，material 省略表示清除；超上限时忽略 */
    fillRegion: (
        id: number,
        x0: number, y0: number, z0: number,
        x1: number, y1: number, z1: number,
        material?: SurfaceMaterialId,
    ) => void
    /** 材质批量替换：把整个建筑世界的 from 材质替换为 to */
    replaceMaterial: (id: number, from: SurfaceMaterialId, to: SurfaceMaterialId) => void
    /** 限定区域的材质替换：矩形区域内 from → to */
    replaceMaterialInRegion: (
        id: number,
        from: SurfaceMaterialId,
        to: SurfaceMaterialId,
        x0: number, y0: number, z0: number,
        x1: number, y1: number, z1: number,
    ) => void
    /** 预制体编排：按配方生成到指定体素原点（局部坐标） */
    stampPrefab: (id: number, config: BuildingConfig, x: number, y: number, z: number) => void
    /** 放置自由道具（局部坐标 + 四分之一圈偏航） */
    placeProp: (
        id: number,
        kind: BuildingPropKind,
        material: SurfaceMaterialId,
        x: number, y: number, z: number,
        yawQuarter: number,
    ) => void
    /** 更新指定序号的自由道具（材质 / 偏航） */
    updateProp: (id: number, index: number, partial: Partial<Pick<BuildingProp, 'material' | 'yawQuarter'>>) => void
    /** 移除指定序号的自由道具 */
    removeProp: (id: number, index: number) => void
    /** 区域预览：以体素范围显示线框盒；worldId 或范围缺省表示清除 */
    setRegionPreview: (
        worldId: number | undefined,
        min?: readonly [number, number, number],
        max?: readonly [number, number, number],
    ) => void
    /** 体素拾取：对可见 chunk 网格做射线检测，返回命中体素与面法线（无命中返回 undefined） */
    pickBlock: (raycaster: Raycaster) => BlockPick | undefined
    getSaveWorlds: () => BuildingWorldSaveData[]
    loadSaveWorlds: (worlds: BuildingWorldSaveData[]) => void
    /** 每帧视图更新：分块网格构建 / 距离卸载 / 近处碰撞体（静态世界不参与物理步进） */
    updateView: (camera: Camera, dt: number) => void
}
