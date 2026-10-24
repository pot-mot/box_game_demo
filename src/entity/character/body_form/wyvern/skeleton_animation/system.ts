import {defineCreatureProgressAnimation, type CreatureProgressConfig} from '../../common/skeleton_animation/progress_creature.ts'
import {buildWyvernSkeleton} from '../skeleton/skeleton.ts'
import {createWyvernPreviewClip} from './preview.ts'
import {wyvernAttackClip, wyvernBaseClip, WYVERN_PRESERVED_JOINTS} from './clips.ts'

/** 双足飞龙动画定义：运行时统一走进度组合树；previewClip 采样同一棵树供骨骼编辑器使用。 */
const config: CreatureProgressConfig = {
    skeleton: buildWyvernSkeleton,
    baseClip: wyvernBaseClip,
    attackClip: wyvernAttackClip,
    turnAim: {body: 'body', neck: 'neck', head: 'head'},
    preservedJoints: WYVERN_PRESERVED_JOINTS,
    fallingJoints: ['lHip', 'lKnee', 'rHip', 'rKnee'],
}

export const WYVERN_ANIMATION = defineCreatureProgressAnimation(config, createWyvernPreviewClip(config))
