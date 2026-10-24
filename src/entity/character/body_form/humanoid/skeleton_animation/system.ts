import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'
import type {FormAnimation} from '../../common/skeleton_animation/form_animation.ts'
import {createHumanoidProgressSystem} from './progress_system.ts'
import {previewHumanoidClip} from './preview.ts'

/** 人形动画定义：运行时走进度组合树；previewClip 采样同一棵树供骨骼编辑器使用。 */
export const HUMANOID_ANIMATION: FormAnimation = {
    skeleton: buildCharacterSkeletonDefinition,
    previewClip: previewHumanoidClip,
    createSystem: options => createHumanoidProgressSystem(options),
}
