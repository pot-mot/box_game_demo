import {defineCreatureProgressAnimation, type CreatureProgressConfig} from '../../common/skeleton_animation/progress_creature.ts'
import {buildHorseSkeleton} from '../skeleton/skeleton.ts'
import {createHorsePreviewClip} from './preview.ts'
import {horseAttackClip, horseBaseClip, HORSE_PRESERVED_JOINTS} from './clips.ts'

/** 马动画定义：运行时统一走进度组合树；previewClip 采样同一棵树供骨骼编辑器使用。 */
const config: CreatureProgressConfig = {
    skeleton: buildHorseSkeleton,
    baseClip: horseBaseClip,
    attackClip: horseAttackClip,
    turnAim: {body: 'body', neck: 'neck', head: 'head'},
    preservedJoints: HORSE_PRESERVED_JOINTS,
    fallingJoints: ['flHip', 'flKnee', 'frHip', 'frKnee', 'rlHip', 'rlKnee', 'rrHip', 'rrKnee'],
}

export const HORSE_ANIMATION = defineCreatureProgressAnimation(config, createHorsePreviewClip(config))
