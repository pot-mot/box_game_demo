import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, RigidBodyConfig, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'

export interface CommonBoxConfig extends RigidBodyConfig {}

export interface CommonBox extends BaseEntity<CommonBoxConfig> {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
}

export interface CommonEntityContext extends EntityInfoSource {
    add: (config: CommonBoxConfig, x: number, y: number, z: number) => CommonBox
    getSelected: () => CommonBox | undefined
    getAll: () => CommonBox[]
    updateConfig: (id: number, partial: Partial<CommonBoxConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
}
