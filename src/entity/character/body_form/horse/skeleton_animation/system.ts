import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {defineFormAnimation, type FormAnimation} from '../../common/skeleton_animation/form_animation.ts'
import {buildHorseSkeleton} from '../skeleton/skeleton.ts'
import {horseAttackClip, horseBaseClip, HORSE_PRESERVED_JOINTS} from './clips.ts'

const HORSE_REST_POSE = skeletonFromDefinition(buildHorseSkeleton()).readPose()

/** 马动画定义：运行时与骨骼编辑器共用；作者数据缺失段回退公式动画。 */
export const HORSE_ANIMATION: FormAnimation = defineFormAnimation({
    skeleton: buildHorseSkeleton,
    baseClip: state => horseBaseClip(state),
    attackClip: segment => horseAttackClip(segment),
    restPose: () => HORSE_REST_POSE,
    preservedJointIds: HORSE_PRESERVED_JOINTS,
})
