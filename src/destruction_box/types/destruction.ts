import type {Mesh, LineSegments} from 'three'
import type {Body, Vec3} from 'cannon-es'

export interface DestructibleConfig {
    width: number
    height: number
    depth: number
    mass: number
    friction: number
    maxHealth: number
    fragmentSeedCount: number
    ejectForce: number
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

export interface DestructibleBox {
    id: number
    mesh: Mesh
    edges: LineSegments
    cracks: LineSegments | undefined
    body: Body
    config: DestructibleConfig
    health: number
    vertexOffsets: Float32Array | undefined
    fragments: FragmentData[]
    destroyed: boolean
    debris: DestructibleDebris[] | undefined
}

export interface CollisionRecord {
    contactPoint: [number, number, number]
    normal: [number, number, number]
    relativeVelocity: number
}

export interface DestructionContext {
    add: (config: DestructibleConfig, x: number, y: number, z: number) => DestructibleBox
    remove: (id: number) => void
    select: (id: number | undefined) => DestructibleBox | undefined
    getBoxes: () => DestructibleBox[]
    getBoxMeshes: () => Mesh[]
    getSelected: () => DestructibleBox | undefined
    selectedId: number | undefined
    getDebris: () => DestructibleDebris[]
    update: (dt: number) => void
}
