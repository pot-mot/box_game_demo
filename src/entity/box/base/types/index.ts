import type {Mesh} from 'three'
import type {Body} from 'cannon-es'
import type {PanelContext} from '../../ui'

export interface BoxSize {
    width: number
    height: number
    depth: number
}

export interface RigidBodyConfig extends BoxSize {
    mass: number
    friction: number
}

export interface XYZ {
    x: number
    y: number
    z: number
}

export interface BaseEntity<TConfig> {
    id: number
    config: TConfig
    mesh: Mesh
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
