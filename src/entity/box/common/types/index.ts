import {z} from 'zod'
import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'
import {CommonBoxConfigSchema} from '../validation.ts'

export type CommonBoxConfig = z.infer<typeof CommonBoxConfigSchema>
export {CommonBoxConfigSchema} from '../validation.ts'

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
