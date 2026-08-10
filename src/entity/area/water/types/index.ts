import {z} from 'zod'
import type {LineSegments, Mesh} from 'three'
import type {EntityEmitter} from '../../../box/base/types/event_emitter.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import {WaterBlockConfigSchema} from '../validation.ts'

export type WaterBlockConfig = z.infer<typeof WaterBlockConfigSchema>
export {WaterBlockConfigSchema} from '../validation.ts'

/** 水体位置/旋转 —— 替代 cannon-es Body，水方块不参与物理世界 */
interface WaterTransform {
    x: number
    y: number
    z: number
    qx: number
    qy: number
    qz: number
    qw: number
}

export interface WaterBlock {
    id: number
    config: WaterBlockConfig
    mesh: Mesh
    transform: WaterTransform
    wireframe: LineSegments | undefined
    emitter: EntityEmitter
    rowText: string
}

export interface WaterBlockInfo {
    config: WaterBlockConfig
    position: {x: number; y: number; z: number}
    quaternion: {x: number; y: number; z: number; w: number}
}

export interface WaterEntityContext extends EntityInfoSource {
    add: (config: WaterBlockConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}) => WaterBlock
    getSelected: () => WaterBlock | undefined
    getAll: () => WaterBlock[]
    resize: (id: number, partial: Partial<WaterBlockConfig>) => void
    setPosition: (id: number, pos: {x: number; y: number; z: number}) => void
    setTransform: (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}) => void
    updateTime: (time: number) => void
    preSync?(dt: number, time: number): void
}
