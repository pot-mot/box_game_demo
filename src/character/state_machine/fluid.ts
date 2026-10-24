import type {CharacterEntity} from '../types.ts'

/** 当前浸没比例（0..1；无区域环境场时为 0）——由 area 的 `float` 场逐帧写入 `entity.environment.fluidFraction` */
export const fluidFractionOf = (entity: CharacterEntity): number =>
    entity.state.environment?.fluidFraction ?? 0
