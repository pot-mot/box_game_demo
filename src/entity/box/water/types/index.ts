import type {LineSegments} from 'three'
import type {BaseEntity, BoxSize} from '../../base/types'
import type {EntityInfoSource} from '../../base/types/entity_info'

export interface WaterBlockConfig extends BoxSize {
    density: number
}

export interface WaterBlock extends BaseEntity<WaterBlockConfig> {
    wireframe: LineSegments | undefined
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
