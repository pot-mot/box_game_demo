import {z} from 'zod'
import type {LineSegments, Points} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {BaseEntity, XYZ} from '../base/types'
import type {EntityInfoSource} from '../base/types/entity_info'
import type {FragmentData} from '../../destroyed/types'
import type {BoxTraitId} from '../constants.ts'
import {BoxConfigSchema} from '../validation.ts'

export type BoxConfig = z.infer<typeof BoxConfigSchema>
export {BoxConfigSchema} from '../validation.ts'

/** 碰撞记录（可破坏特性用，方向确定性存储进存档） */
export interface CollisionRecord {
    contactPoint: [number, number, number]
    normal: [number, number, number]
    relativeVelocity: number
}

/** 燃烧粒子数据（SOA） */
export interface ParticleData {
    pos: Float32Array
    vel: Float32Array
    color: Float32Array
    size: Float32Array
    age: Float32Array
    lifetime: Float32Array
    active: Uint8Array
}

/** 可破坏特性运行时状态 */
export interface DestructibleRuntime {
    health: number
    maxHealth: number
    destroyed: boolean
    fragments: FragmentData[]
    collisions: CollisionRecord[]
    collisionHistory: CollisionRecord[]
    cooldowns: Map<number, number>
}

/** 燃烧特性运行时状态 */
export interface BurningRuntime {
    health: number
    maxHealth: number
    burnProgress: number
    particles: Points
    particleData: ParticleData
}

/** 磁力特性运行时状态（无附加状态，仅作为启用标记） */
export type MagnetRuntime = Record<string, never>

/** 弹性特性运行时状态 */
export interface ElasticRuntime {
    def: [number, number, number]
    vel: [number, number, number]
    cooldowns: Map<number, number>
}

/** 特性标识 → 运行时状态类型 */
export interface BoxTraitRuntimeMap {
    'destructible': DestructibleRuntime
    'burning': BurningRuntime
    'magnet': MagnetRuntime
    'elastic': ElasticRuntime
}

/** 恢复运行态（加载存档时）的可选参数 */
export interface BoxAddOptions {
    destructible?: {
        health?: number
        collisions?: CollisionRecord[]
        collisionHistory?: CollisionRecord[]
        cooldowns?: Map<number, number>
    }
    burning?: {
        health?: number
    }
    elastic?: {
        def?: [number, number, number]
        vel?: [number, number, number]
    }
}

export interface Box extends BaseEntity<BoxConfig> {
    body: RAPIER.RigidBody
    mainCollider: RAPIER.Collider
    edges: LineSegments
    wireframe: LineSegments | undefined
    /** 已启用特性的运行时状态（键存在 = 该特性启用） */
    runtime: {[K in BoxTraitId]?: BoxTraitRuntimeMap[K]}
}

export interface BoxEntityContext extends EntityInfoSource {
    add: (
        config: BoxConfig,
        x: number,
        y: number,
        z: number,
        quat?: {x: number; y: number; z: number; w: number},
        options?: BoxAddOptions,
    ) => Box
    getSelected: () => Box | undefined
    getAll: () => Box[]
    updateConfig: (id: number, partial: Partial<BoxConfig>) => void
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
    /** 设置某特性（destructible / burning 之一）的生命值 */
    setTraitHealth: (id: number, trait: 'destructible' | 'burning', health: number) => void
    updatePhysics: (dt: number) => void
    preSync?: (dt: number, time: number) => void
}
