import type {BaseEntity, EntityContext, BoxSize} from '../../base/types'

export interface WaterBlockConfig extends BoxSize {}

export interface WaterBlock extends BaseEntity<WaterBlockConfig> {}

export interface WaterBlockInfo {
    config: WaterBlockConfig
    position: {x: number; y: number; z: number}
}

export interface WaterEntityContext extends EntityContext<WaterBlockConfig, WaterBlock> {
    resize: (id: number, partial: Partial<WaterBlockConfig>) => void
    setPosition: (id: number, pos: {x: number; y: number; z: number}) => void
    updateTime: (time: number) => void
}
