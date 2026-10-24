import {defineCreatureProgressAnimation, type CreatureProgressConfig} from '../../common/skeleton_animation/progress_creature.ts'
import {buildWolfSkeleton} from '../skeleton/skeleton.ts'
import {createWolfPreviewClip} from './preview.ts'
import {wolfAttackClip, wolfBaseClip, WOLF_PRESERVED_JOINTS} from './clips.ts'

/** 狼动画定义：运行时统一走进度组合树；previewClip 采样同一棵树供骨骼编辑器使用。 */
const config: CreatureProgressConfig = {
    skeleton: buildWolfSkeleton,
    baseClip: wolfBaseClip,
    attackClip: wolfAttackClip,
    turnAim: {body: 'body', neck: 'neck', head: 'head'},
    preservedJoints: WOLF_PRESERVED_JOINTS,
    fallingJoints: ['flHip', 'flKnee', 'frHip', 'frKnee', 'rlHip', 'rlKnee', 'rrHip', 'rrKnee'],
}

export const WOLF_ANIMATION = defineCreatureProgressAnimation(config, createWolfPreviewClip(config))
