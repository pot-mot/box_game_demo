import type {BoxPartPalette} from '../../../render/box_parts.ts'
import type {SkeletonPreset} from '../../skeleton/appearance.ts'
import {assembleCharacterAppearance, resizeBoneParts} from '../appearance/assemble.ts'
import {buildCharacterSkeletonDefinition} from './preset.ts'
import {PRESET_PALETTE} from './constants.ts'

/**
 * 角色骨架预设：把「人形骨架定义 + 方块人外观装配」打包为 entity/skeleton 可消费的预设。
 * entity/skeleton 保持通用（不依赖角色），骨骼编辑器（modes/bone_edit）在装配时注入本预设，
 * 与游玩/展示共用同一套外观构建器（`assembleCharacterAppearance`）。
 */
export const createCharacterSkeletonPreset = (palette: BoxPartPalette = PRESET_PALETTE): SkeletonPreset => ({
    createDefinition: buildCharacterSkeletonDefinition,
    mountAppearance: (groups) => {
        const appearance = assembleCharacterAppearance(groups, palette)
        return {
            boneParts: appearance.boneParts,
            partMeshes: appearance.partMeshes,
            cleanup: appearance.cleanup,
            resize: (skeleton) => resizeBoneParts(skeleton, appearance),
        }
    },
})
