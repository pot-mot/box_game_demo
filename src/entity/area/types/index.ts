import {z} from 'zod'
import type {LineSegments, Mesh} from 'three'
import type {XYZ} from '../../box/base/types/index.ts'
import type {EntityEmitter} from '../../box/base/types/event_emitter.ts'
import type {EntityInfoSource} from '../../box/base/types/entity_info.ts'
import {AreaConfigSchema, AreaShapeSchema} from '../validation.ts'

export type AreaConfig = z.infer<typeof AreaConfigSchema>
export type AreaShape = z.infer<typeof AreaShapeSchema>
export {AreaConfigSchema} from '../validation.ts'

/** 区域位置/旋转 —— 区域不参与物理世界（无刚体 / 无碰撞体），变换手工维护 */
interface AreaTransform {
    x: number
    y: number
    z: number
    qx: number
    qy: number
    qz: number
    qw: number
}

export interface Area {
    id: number
    config: AreaConfig
    mesh: Mesh
    transform: AreaTransform
    wireframe: LineSegments | undefined
    emitter: EntityEmitter
    rowText: string
}

/** 每帧传给场求解器的快照 */
export interface AreaInfo {
    config: AreaConfig
    position: XYZ
    quaternion: {x: number; y: number; z: number; w: number}
}

export interface AreaEntityContext extends EntityInfoSource {
    add: (
        config: AreaConfig,
        x: number,
        y: number,
        z: number,
        quat?: {x: number; y: number; z: number; w: number},
    ) => Area
    getSelected: () => Area | undefined
    getAll: () => Area[]
    updateConfig: (id: number, partial: Partial<AreaConfig>) => void
    setPosition: (id: number, pos: XYZ) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    updateTime: (time: number) => void
    /** 仅水材质网格（供折射双 Pass 渲染） */
    getRefractionMeshes: () => Mesh[]
    preSync?: (dt: number, time: number) => void
}
