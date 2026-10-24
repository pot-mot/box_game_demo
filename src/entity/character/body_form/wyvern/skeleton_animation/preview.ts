import {createCreaturePreviewClip} from '../../common/skeleton_animation/progress_creature.ts'
import type {CreatureProgressConfig} from '../../common/skeleton_animation/progress_creature.ts'
import type {FormAnimation} from '../../common/skeleton_animation/form_animation.ts'

/** wyvern 体形预览入口；共用通用兽形进度组合实现。 */
export const createWyvernPreviewClip = (config: CreatureProgressConfig): FormAnimation['previewClip'] =>
    createCreaturePreviewClip(config)
