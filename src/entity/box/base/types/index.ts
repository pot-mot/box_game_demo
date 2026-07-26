import {z} from 'zod'
import type {Mesh} from 'three'
import type {Body} from 'cannon-es'
import type {EntityEmitter} from './event_emitter'
import type {PanelContext} from '../ui'
import {BoxSizeSchema, RigidBodyConfigSchema} from '../validation.ts'

export type BoxSize = z.infer<typeof BoxSizeSchema>
export type RigidBodyConfig = z.infer<typeof RigidBodyConfigSchema>

export {BoxSizeSchema, RigidBodyConfigSchema} from '../validation.ts'

export interface XYZ {
    x: number
    y: number
    z: number
}

export interface BaseEntity<TConfig> {
    id: number
    config: TConfig
    mesh: Mesh
    emitter: EntityEmitter
    rowText: string
}

export interface HasBody {
    body: Body
}

export interface EntityContext<TConfig, TEntity extends BaseEntity<TConfig>> {
    add: (config: TConfig, x: number, y: number, z: number) => TEntity
    remove: (id: number) => void
    select: (id: number | undefined) => TEntity | undefined
    getSelected: () => TEntity | undefined
    getAll: () => TEntity[]
    getMeshes: () => Mesh[]
    getSelectedId: () => number | undefined
    panel: PanelContext
}
