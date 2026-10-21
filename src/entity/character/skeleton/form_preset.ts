import type {BoxPartPalette} from '../../../render/box_parts.ts'
import type {SkeletonPreset} from '../../skeleton/appearance.ts'
import type {BodyForm} from '../body_form/types.ts'
import {PRESET_PALETTE} from './constants.ts'

/** 把任意体形计划包装为骨骼编辑器可消费的骨架预设（定义 + 外观装配） */
export const createBodyFormSkeletonPreset = (
    form: BodyForm,
    palette: BoxPartPalette = form.palette ?? PRESET_PALETTE,
): SkeletonPreset => ({
    createDefinition: form.buildSkeleton,
    mountAppearance: (groups) => {
        const appearance = form.assemble(groups, palette)
        return {
            boneParts: appearance.boneParts,
            partMeshes: appearance.partMeshes,
            cleanup: appearance.cleanup,
            resize: appearance.resize,
            update: appearance.update,
        }
    },
})
