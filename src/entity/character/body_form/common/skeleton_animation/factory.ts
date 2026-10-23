import type {StringLocaleKey} from '../../../../../i18n/index.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {DEFAULT_BAKE_FPS} from '../../../../../skeleton/anim/bake.ts'
import type {PoseFunction} from '../creature_runtime/pose.ts'
import {
    bakeAnimationModule,
    type AnimationComposition,
    type AnimationFactory,
    type AnimationModule,
    type SkeletonAnimation,
} from './composition.ts'

/** 同型姿态动画工厂参数：id / 时长 / 循环 / 逐帧姿态函数（种类与数量固定） */
export interface PoseAnimationParams {
    readonly id: string
    readonly duration: number
    readonly loop: boolean
    readonly pose: PoseFunction
}

/** 姿态函数 → 百分比时间轴动画（工厂固定参数类型与数量） */
export const poseAnimationFactory: AnimationFactory<PoseAnimationParams> = {
    create: ({id, duration, loop, pose}) => ({
        id,
        duration,
        loop,
        sample: (progress) => pose(progress * duration, duration),
    }),
}

/** 组装动画模组（动画 / 组合数量由调用方固定提供） */
export const createAnimationModule = (
    id: string,
    nameKey: StringLocaleKey,
    animations: readonly SkeletonAnimation[],
    compositions: readonly AnimationComposition[] = [],
): AnimationModule => ({id, nameKey, animations, compositions})

/** 将单动画模组整体烘焙为运行时 clip（模块级缓存键由调用方维护） */
export const bakeSingleAnimation = (
    skeleton: SkeletonDefinition,
    module: AnimationModule,
    animationId: string,
    fps = DEFAULT_BAKE_FPS,
): BoneAnimationClip => {
    const clip = bakeAnimationModule(skeleton, module, fps).get(animationId)
    if (clip === undefined) throw new Error(`动画模组 ${module.id} 未产出 clip ${animationId}`)
    return clip
}
