import type {Mesh} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {EntityInfoSource} from '../box/base/types/entity_info.ts'
import type {XYZ} from '../box/base/types/index.ts'
import type {SurfaceMaterialId} from '../../render/materials/ids.ts'
import type {SlopeBlockConfig} from './validation.ts'

export interface SlopeBlockEntity {
    id: number
    config: SlopeBlockConfig
    mesh: Mesh
    body: RAPIER.RigidBody
    collider: RAPIER.Collider
    rowText: string
}

/** 斜面块实体系统公开接口 */
export interface SlopeBlockContext extends EntityInfoSource {
    add: (
        config: SlopeBlockConfig,
        x: number,
        y: number,
        z: number,
        quat?: {x: number; y: number; z: number; w: number},
    ) => SlopeBlockEntity
    getAll: () => readonly SlopeBlockEntity[]
    getById: (id: number) => SlopeBlockEntity | undefined
    /** 修改配置并重建网格 / 碰撞体（保留世界位置与旋转） */
    updateConfig: (id: number, config: SlopeBlockConfig) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    getMaterial: (id: number) => SurfaceMaterialId | undefined
}
