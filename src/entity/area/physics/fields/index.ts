import type {AreaConfig} from '../../types/index.ts'
import type {AreaFieldContext} from './types.ts'
import {applyFloat} from './float.ts'
import {applyWind} from './wind.ts'
import {applyGravity} from './gravity.ts'

export type {AreaFieldContext} from './types.ts'

/**
 * 对单个区域×刚体应用全部启用场（顺序 float → wind → gravity）。
 * 浮力负责浸没比例与拖拽速率、风场写入流速目标、重力场写入加速度增量，可叠加。
 */
export const applyFields = (ctx: AreaFieldContext, config: AreaConfig): void => {
    const fields = config.fields
    if (fields.float !== undefined) applyFloat(ctx, fields.float)
    if (fields.wind !== undefined) applyWind(ctx, fields.wind)
    if (fields.gravity !== undefined) applyGravity(ctx, fields.gravity)
}
