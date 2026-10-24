import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../character/handedness.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {AppearanceSystem, AppearanceSystemOptions, AnimationContext} from '../../../appearance/types.ts'

/** 动画变体：运行时进度图与编辑器预览共用。 */
export interface FormClipVariant {
    readonly weaponHeld: boolean
    readonly horizontalSpeed: number
    readonly holdMode?: HoldMode
    readonly handedness?: Handedness
    readonly weaponClassId?: string
    readonly shieldHands?: Readonly<{main: boolean; off: boolean}>
}

/** 默认变体（骨骼编辑器预览 / 测试使用）。 */
export const DEFAULT_FORM_CLIP_VARIANT: FormClipVariant = {
    weaponHeld: false,
    horizontalSpeed: 0,
    holdMode: 'one_handed',
    handedness: DEFAULT_HANDEDNESS,
    shieldHands: {main: false, off: false},
}

/** 由运行时动画上下文派生动画变体。 */
export const variantOfAnimationContext = (ctx: AnimationContext): FormClipVariant => ({
    weaponHeld: ctx.weaponHeld,
    horizontalSpeed: ctx.horizontalSpeed,
    holdMode: ctx.humanoid?.holdMode ?? 'one_handed',
    handedness: ctx.humanoid?.handedness ?? DEFAULT_HANDEDNESS,
    weaponClassId: ctx.humanoid?.weaponClassId,
    shieldHands: ctx.humanoid?.shieldHands ?? {main: false, off: false},
})

/** 骨骼编辑器预览请求：基础状态或攻击段，统一由生产进度组合树烘焙。 */
export type FormPreviewRequest =
    | {readonly kind: 'base'; readonly state: BaseClipState; readonly variant: FormClipVariant}
    | {readonly kind: 'attack'; readonly segment: AttackSegment; readonly variant: FormClipVariant}

/**
 * 体形动画定义：
 * - `createSystem` 是运行时唯一入口（人形 / 兽形各自走进度组合树）；
 * - `previewClip` 只服务骨骼编辑器动作库，内部采样同一棵进度组合树。
 */
export interface FormAnimation {
    readonly skeleton?: () => SkeletonDefinition
    readonly previewClip: (request: FormPreviewRequest) => BoneAnimationClip
    readonly createSystem: (options?: AppearanceSystemOptions) => AppearanceSystem
}
