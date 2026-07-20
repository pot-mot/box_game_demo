import type {LineSegments, Points} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, RigidBodyConfig, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'
import type {HealthComponent} from '../../base/types/health'

export interface ParticleData {
    pos: Float32Array
    vel: Float32Array
    color: Float32Array
    size: Float32Array
    age: Float32Array
    lifetime: Float32Array
    active: Uint8Array
}

export interface BurningBoxConfig extends RigidBodyConfig {
    maxHealth: number
}

export interface BurningBox extends BaseEntity<BurningBoxConfig>, HealthComponent {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
    burnProgress: number
    particles: Points
    particleData: ParticleData
}

export interface BurningEntityContext extends EntityInfoSource {
    add: (config: BurningBoxConfig, x: number, y: number, z: number) => BurningBox
    getSelected: () => BurningBox | undefined
    getAll: () => BurningBox[]
    updateConfig: (id: number, partial: Partial<BurningBoxConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    setHealth: (id: number, health: number) => void
    updatePhysics: (dt: number) => void
}
