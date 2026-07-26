import {z} from 'zod'
import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'
import {ElasticBoxConfigSchema} from '../validation.ts'

export type ElasticBoxConfig = z.infer<typeof ElasticBoxConfigSchema>
export {ElasticBoxConfigSchema} from '../validation.ts'

export interface ElasticBox extends BaseEntity<ElasticBoxConfig> {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
    def: [number, number, number]
    vel: [number, number, number]
    cooldowns: Map<number, number>
}

export interface ElasticEntityContext extends EntityInfoSource {
    add: (config: ElasticBoxConfig, x: number, y: number, z: number) => ElasticBox
    getSelected: () => ElasticBox | undefined
    getAll: () => ElasticBox[]
    updateConfig: (id: number, partial: Partial<ElasticBoxConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    preSync?(dt: number, time: number): void
}
