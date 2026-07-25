import type {LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {BaseEntity, RigidBodyConfig, XYZ} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'

/** 弹性箱子配置 */
export interface ElasticBoxConfig extends RigidBodyConfig {
    stiffness: number
    dampingRatio: number
    maxDeformFraction: number
}

/** 弹性箱子运行时对象 */
export interface ElasticBox extends BaseEntity<ElasticBoxConfig> {
    body: Body
    edges: LineSegments
    wireframe: LineSegments | undefined
    /** 三轴向形变位移 [dx, dy, dz] */
    def: [number, number, number]
    /** 三轴向形变速度 [vx, vy, vz] */
    vel: [number, number, number]
    /** 碰撞冷却计时器（otherBodyId → 剩余秒数） */
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