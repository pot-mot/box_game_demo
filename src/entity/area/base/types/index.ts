import type {LineSegments, Mesh} from 'three'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {EntityEmitter} from '../../../box/base/types/event_emitter.ts'

export interface AreaBounds {
    width: number
    height: number
    depth: number
}

export interface BaseAreaConfig extends AreaBounds {
    strength: number
}

export interface BaseAreaEntity<TConfig> {
    id: number
    config: TConfig
    mesh: Mesh
    wireframe: LineSegments | undefined
    emitter: EntityEmitter
    rowText: string
}

export interface AreaContext<TConfig, TEntity extends BaseAreaEntity<TConfig>> extends EntityInfoSource {
    add: (config: TConfig, x: number, y: number, z: number) => TEntity
    getSelected: () => TEntity | undefined
    getAll: () => TEntity[]
    getEntityList: () => TEntity[]
}

export interface AreaSetupOptions {
    type: string
    badgeLabel: string
    badgeColor: string
}
