import {defineCreatureProgressAnimation} from '../../common/skeleton_animation/progress_creature.ts'
import {buildWolfSkeleton} from '../skeleton/skeleton.ts'
import {wolfAttackClip, wolfBaseClip, WOLF_PRESERVED_JOINTS} from './clips.ts'

/** 狼动画定义：运行时统一走进度组合树；baseClip/attackClip 仅服务骨骼编辑器。 */
export const WOLF_ANIMATION = defineCreatureProgressAnimation({
    skeleton: buildWolfSkeleton,
    baseClip: wolfBaseClip,
    attackClip: wolfAttackClip,
    turnAim: {body: 'body', neck: 'neck', head: 'head'},
    preservedJoints: WOLF_PRESERVED_JOINTS,
    fallingJoints: ['flHip', 'flKnee', 'frHip', 'frKnee', 'rlHip', 'rlKnee', 'rrHip', 'rrKnee'],
})
