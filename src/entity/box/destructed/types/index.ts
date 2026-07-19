import type {Mesh, LineSegments} from 'three'
import type {Body, Vec3} from 'cannon-es'
import type {BaseEntity, RigidBodyConfig} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'

export interface DestructibleConfig extends RigidBodyConfig {
    maxHealth: number
}

export interface FragmentData {
    renderVertices: Float32Array
    renderIndices: number[]
    hullVertices: Vec3[]
    hullFaces: number[][]
    centroid: [number, number, number]
    massRatio: number
}

export interface DestructibleDebris {
    mesh: Mesh
    edges: LineSegments
    body: Body
    lifetime: number
}

export interface CollisionRecord {
    contactPoint: [number, number, number]
    normal: [number, number, number]
    relativeVelocity: number
}

export interface DestructibleBox extends BaseEntity<DestructibleConfig> {
    edges: LineSegments
    cracks: LineSegments | undefined
    wireframe: LineSegments | undefined
    body: Body
    health: number
    vertexOffsets: Float32Array | undefined
    fragments: FragmentData[]
    destroyed: boolean
    debris: DestructibleDebris[] | undefined
    _collisions: CollisionRecord[]
    _collisionHistory: CollisionRecord[]
    _cooldowns: Map<number, number>
    _onCollide: ((e: any) => void) | undefined
}

export interface DestructionEntityContext extends EntityInfoSource {
    add: (config: DestructibleConfig, x: number, y: number, z: number) => DestructibleBox
    getSelected: () => DestructibleBox | undefined
    getAll: () => DestructibleBox[]
    getDebris: () => DestructibleDebris[]
    updatePhysics: (dt: number) => void
}
