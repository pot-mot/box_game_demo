import {z} from 'zod'
import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, XYZ} from '../../../box/base/types'
import type {EntityInfoSource} from '../../../box/base/types/entity_info'
import type {FragmentData} from '../../../destroyed/types'
import {FragmentConfigSchema} from '../validation.ts'

export type FragmentConfig = z.infer<typeof FragmentConfigSchema>
export {FragmentConfigSchema} from '../validation.ts'

export interface Fragment extends BaseEntity<FragmentConfig> {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
    label: string
}

export interface FragmentEntityContext extends EntityInfoSource {
    add: (data: FragmentData, label: string, pos: {x: number; y: number; z: number}, quat: {x: number; y: number; z: number; w: number}, impulse?: {x: number; y: number; z: number}) => Fragment
    getSelected: () => Fragment | undefined
    getAll: () => Fragment[]
    updateConfig: (id: number, partial: Partial<FragmentConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    updatePhysics: (dt: number) => void
    preSync?(dt: number, time: number): void
}
