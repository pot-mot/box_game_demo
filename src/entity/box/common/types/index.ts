import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, EntityContext, RigidBodyConfig, XYZ} from '../../base/types'

export interface CommonBoxConfig extends RigidBodyConfig {}

export interface CommonBox extends BaseEntity<CommonBoxConfig> {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
}

export interface CommonEntityContext extends EntityContext<CommonBoxConfig, CommonBox> {
    updateConfig: (id: number, partial: Partial<CommonBoxConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
}
