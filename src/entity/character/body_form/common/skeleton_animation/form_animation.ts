import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../character/handedness.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {AppearanceSystem, AppearanceSystemOptions, AnimationContext} from '../../../appearance/types.ts'

/** 编辑器 clip 预览变体；运行时进度图直接读取 AnimationContext / CharacterState。 */
export interface FormClipVariant {
    readonly weaponHeld: boolean
    readonly horizontalSpeed: number
    readonly holdMode?: HoldMode
    readonly handedness?: Handedness
    readonly weaponClassId?: string
    readonly shieldHands?: Readonly<{main: boolean; off: boolean}>
}

/** 默认变体（骨骼编辑器预览 / 非人形体形使用）。 */
export const DEFAULT_FORM_CLIP_VARIANT: FormClipVariant = {
    weaponHeld: false,
    horizontalSpeed: 0,
    holdMode: 'one_handed',
    handedness: DEFAULT_HANDEDNESS,
    shieldHands: {main: false, off: false},
}

/** 由运行时动画上下文派生编辑器 clip 变体。 */
export const variantOfAnimationContext = (ctx: AnimationContext): FormClipVariant => ({
    weaponHeld: ctx.weaponHeld,
    horizontalSpeed: ctx.horizontalSpeed,
    holdMode: ctx.humanoid?.holdMode ?? 'one_handed',
    handedness: ctx.humanoid?.handedness ?? DEFAULT_HANDEDNESS,
    weaponClassId: ctx.humanoid?.weaponClassId,
    shieldHands: ctx.humanoid?.shieldHands ?? {main: false, off: false},
})

/**
 * 体形动画定义：
 * - `createSystem` 是运行时唯一入口（人形 / 兽形各自走进度组合树）；
 * - `baseClip` / `attackClip` 只服务骨骼编辑器的整身 clip 预览；
 * - `weaponVariants` 供编辑器生成「持械 / 空手」两条内置条目。
 */
export interface FormAnimation {
    readonly skeleton?: () => SkeletonDefinition
    readonly baseClip: (state: BaseClipState, variant: FormClipVariant) => BoneAnimationClip
    readonly attackClip: (segment: AttackSegment, variant: FormClipVariant) => BoneAnimationClip
    readonly weaponVariants?: boolean
    readonly createSystem: (options?: AppearanceSystemOptions) => AppearanceSystem
}
