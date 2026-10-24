import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {defineFormAnimation, type FormAnimation} from '../../common/skeleton_animation/form_animation.ts'
import {buildWyvernSkeleton} from '../skeleton/skeleton.ts'
import {wyvernAttackClip, wyvernBaseClip, WYVERN_PRESERVED_JOINTS} from './clips.ts'

const WYVERN_REST_POSE = skeletonFromDefinition(buildWyvernSkeleton()).readPose()

/** 双足飞龙动画定义：运行时与骨骼编辑器共用；作者数据缺失段回退公式动画。 */
export const WYVERN_ANIMATION: FormAnimation = defineFormAnimation({
    skeleton: buildWyvernSkeleton,
    baseClip: state => wyvernBaseClip(state),
    attackClip: segment => wyvernAttackClip(segment),
    restPose: () => WYVERN_REST_POSE,
    preservedJointIds: WYVERN_PRESERVED_JOINTS,
})
