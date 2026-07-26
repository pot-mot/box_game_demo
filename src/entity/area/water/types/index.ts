import {z} from 'zod'
import type {LineSegments, Mesh} from 'three'
import type {EntityEmitter} from '../../../box/base/types/event_emitter.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import {WaterBlockConfigSchema} from '../validation.ts'

export type WaterBlockConfig = z.infer<typeof WaterBlockConfigSchema>
export {WaterBlockConfigSchema} from '../validation.ts'

export interface WaterBlock {
    id: number
    config: WaterBlockConfig
    mesh: Mesh
    wireframe: LineSegments | undefined
    emitter: EntityEmitter
    rowText: string
}

export interface WaterBlockInfo {
    config: WaterBlockConfig
    position: {x: number; y: number; z: number}
}

export interface WaterEntityContext extends EntityInfoSource {
    add: (config: WaterBlockConfig, x: number, y: number, z: number) => WaterBlock
    getSelected: () => WaterBlock | undefined
    getAll: () => WaterBlock[]
    resize: (id: number, partial: Partial<WaterBlockConfig>) => void
    setPosition: (id: number, pos: {x: number; y: number; z: number}) => void
    updateTime: (time: number) => void
    preSync?(dt: number, time: number): void
}
