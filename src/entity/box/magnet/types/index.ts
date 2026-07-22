import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, RigidBodyConfig, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'

export interface MagnetBoxConfig extends RigidBodyConfig {
    attractionRadius: number
    attractionStrength: number
}

export interface MagnetBox extends BaseEntity<MagnetBoxConfig> {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
}

export interface MagnetEntityContext extends EntityInfoSource {
    add: (config: MagnetBoxConfig, x: number, y: number, z: number) => MagnetBox
    getSelected: () => MagnetBox | undefined
    getAll: () => MagnetBox[]
    updateConfig: (id: number, partial: Partial<MagnetBoxConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    preSync?(dt: number, time: number): void
}
