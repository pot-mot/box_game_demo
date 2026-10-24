import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {defineFormAnimation, type FormAnimation} from '../../common/skeleton_animation/form_animation.ts'
import {buildWolfSkeleton} from '../skeleton/skeleton.ts'
import {wolfAttackClip, wolfBaseClip, WOLF_PRESERVED_JOINTS} from './clips.ts'

const WOLF_REST_POSE = skeletonFromDefinition(buildWolfSkeleton()).readPose()

/** 狼动画定义：运行时与骨骼编辑器共用；作者数据缺失段回退公式动画。 */
export const WOLF_ANIMATION: FormAnimation = defineFormAnimation({
    skeleton: buildWolfSkeleton,
    baseClip: state => wolfBaseClip(state),
    attackClip: segment => wolfAttackClip(segment),
    restPose: () => WOLF_REST_POSE,
    preservedJointIds: WOLF_PRESERVED_JOINTS,
})
