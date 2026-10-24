import {defineCreatureProgressAnimation} from '../../common/skeleton_animation/progress_creature.ts'
import {buildWyvernSkeleton} from '../skeleton/skeleton.ts'
import {wyvernAttackClip, wyvernBaseClip, WYVERN_PRESERVED_JOINTS} from './clips.ts'

/** 双足飞龙动画定义：运行时统一走进度组合树；baseClip/attackClip 仅服务骨骼编辑器。 */
export const WYVERN_ANIMATION = defineCreatureProgressAnimation({
    skeleton: buildWyvernSkeleton,
    baseClip: wyvernBaseClip,
    attackClip: wyvernAttackClip,
    turnAim: {body: 'body', neck: 'neck', head: 'head'},
    preservedJoints: WYVERN_PRESERVED_JOINTS,
    fallingJoints: ['lHip', 'lKnee', 'rHip', 'rKnee'],
})
