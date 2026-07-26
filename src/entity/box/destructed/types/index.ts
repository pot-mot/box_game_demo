import {z} from 'zod'
import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'
import type {HealthComponent} from '../../base/types/health'
import type {FragmentData} from '../../../destroyed/types'
import {DestructibleConfigSchema} from '../validation.ts'

export type DestructibleConfig = z.infer<typeof DestructibleConfigSchema>
export {DestructibleConfigSchema} from '../validation.ts'

export interface CollisionRecord {
    contactPoint: [number, number, number]
    normal: [number, number, number]
    relativeVelocity: number
}

export interface DestructibleBox extends BaseEntity<DestructibleConfig>, HealthComponent {
    edges: LineSegments
    wireframe: LineSegments | undefined
    body: Body
    fragments: FragmentData[]
    destroyed: boolean
    _collisions: CollisionRecord[]
    _collisionHistory: CollisionRecord[]
    _cooldowns: Map<number, number>
    _onCollide: ((e: any) => void) | undefined
}

export interface DestructionEntityContext extends EntityInfoSource {
    add: (config: DestructibleConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}) => DestructibleBox
    getSelected: () => DestructibleBox | undefined
    getAll: () => DestructibleBox[]
    updateConfig: (id: number, partial: Partial<DestructibleConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    setHealth: (id: number, health: number) => void
    updatePhysics: (dt: number) => void
    preSync?(dt: number, time: number): void
}
