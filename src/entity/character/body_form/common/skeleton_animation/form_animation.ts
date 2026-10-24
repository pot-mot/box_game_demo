import {isAttackState, type BaseClipState, type CharacterState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../character/handedness.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {createBoneAnimationPlayer, type BoneAnimationPlayer} from '../../../../../skeleton/anim/player.ts'
import type {SkeletonPose} from '../../../../../skeleton/skeleton.ts'
import type {SkeletonSceneBridge} from '../../../../skeleton/render/bridge.ts'
import type {AppearanceSystem, AppearanceSystemOptions, AnimationContext, CreatureModel} from '../../../appearance/types.ts'
import {applyJointBlend, snapshotJoints, type JointSnapshot} from '../../../appearance/joint_blend.ts'
import {createCharacterSkeletonBridge} from '../../../appearance/skeleton_bridge.ts'
import {STATE_BLEND_DURATION, walkSpeedScale} from '../../../appearance/constants.ts'
import {segmentPhaseRatios} from '../creature_runtime/timing.ts'

/** 编辑器 / 运行时共用的 clip 变体上下文；非人形体形可忽略其中的人形字段。 */
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

/** 由运行时动画上下文派生 clip 变体。 */
export const variantOfAnimationContext = (ctx: AnimationContext): FormClipVariant => ({
    weaponHeld: ctx.weaponHeld,
    horizontalSpeed: ctx.horizontalSpeed,
    holdMode: ctx.humanoid?.holdMode ?? 'one_handed',
    handedness: ctx.humanoid?.handedness ?? DEFAULT_HANDEDNESS,
    weaponClassId: ctx.humanoid?.weaponClassId,
    shieldHands: ctx.humanoid?.shieldHands ?? {main: false, off: false},
})

export interface FormAnimationOverlayContext {
    readonly dt: number
    readonly bridge: SkeletonSceneBridge
    readonly player: BoneAnimationPlayer
    readonly state: CharacterState
    readonly ctx: AnimationContext
    readonly variant: FormClipVariant
}

export type FormAnimationOverlay = (ctx: FormAnimationOverlayContext) => void

/**
 * 体形动画提供者（跨体形通用）：
 * - `baseClip` / `attackClip`：运行时与骨骼编辑器共用的 clip 来源；
 * - `clipKey`：决定何时重建播放器并触发状态混合；
 * - `restPose` / `preservedJointIds`：稀疏作者 clip 的静止姿态回填边界；
 * - `chargeSeekScale`：蓄力时定位到 clip 内哪个进度；
 * - `createOverlay`：每个动画系统实例的逐帧叠加层（人形下半身行走等）。
 */
export interface FormAnimationProvider {
    readonly skeleton?: () => SkeletonDefinition
    readonly baseClip: (state: BaseClipState, variant: FormClipVariant) => BoneAnimationClip
    readonly attackClip: (segment: AttackSegment, variant: FormClipVariant) => BoneAnimationClip
    readonly clipKey?: (state: CharacterState, ctx: AnimationContext) => string
    readonly restPose?: () => SkeletonPose
    readonly preservedJointIds?: readonly string[]
    readonly chargeSeekScale?: (segment: AttackSegment) => number
    readonly createOverlay?: () => FormAnimationOverlay | undefined
    /** 基础状态是否有「持械 / 空手」两种变体（骨骼编辑器用于生成两条内置条目） */
    readonly weaponVariants?: boolean
}

export interface FormAnimation extends FormAnimationProvider {
    readonly createSystem: (options?: AppearanceSystemOptions) => AppearanceSystem
}

const defaultClipKey = (state: CharacterState, ctx: AnimationContext): string => isAttackState(state)
    ? `${state}:${ctx.attackSegment?.id ?? ''}${ctx.attackHolding ? ':charging' : ''}`
    : state

const defaultChargeSeekScale = (segment: AttackSegment): number => segmentPhaseRatios(segment).windupEnd

const applyRestPose = (
    bridge: SkeletonSceneBridge,
    rest: SkeletonPose,
    preservedJointIds: readonly string[] | undefined,
): void => {
    if (preservedJointIds === undefined || preservedJointIds.length === 0) {
        bridge.applyPose(rest)
        return
    }
    const jointPoses = new Map(rest.jointPoses)
    for (const jointId of preservedJointIds) jointPoses.delete(jointId)
    bridge.applyPose({jointPoses, boneRolls: rest.boneRolls})
}

/**
 * 统一体形动画运行时：基础 / 攻击 clip 调度、状态混合、时间驱动状态、蓄力定位、
 * 稀疏作者 clip 的静止姿态回填与可选叠加层。
 */
export const createFormAnimationSystem = (
    provider: FormAnimationProvider,
    options?: AppearanceSystemOptions,
): AppearanceSystem => {
    const onAttackEvent = options?.onAttackEvent
    const overlay = provider.createOverlay?.()
    let player: BoneAnimationPlayer | undefined
    let currentKey: string | null = null
    let currentModel: CreatureModel | null = null
    let charging = false
    let chargingScale = 1
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0
    let bridge: SkeletonSceneBridge | undefined

    const applyBlend = (dt: number): void => {
        if (blendFrom === null) return
        blendT = applyJointBlend(blendFrom, blendT, dt, STATE_BLEND_DURATION)
        if (blendT >= STATE_BLEND_DURATION) blendFrom = null
    }

    const setup = (state: CharacterState, model: CreatureModel, ctx: AnimationContext): void => {
        player?.pause()
        bridge = createCharacterSkeletonBridge(model, provider.skeleton?.())
        if (isAttackState(state)) onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
        const variant = variantOfAnimationContext(ctx)
        const segment = ctx.attackSegment
        let clip: BoneAnimationClip
        if (isAttackState(state) && segment !== undefined) {
            if (provider.restPose !== undefined) {
                applyRestPose(bridge, provider.restPose(), provider.preservedJointIds)
            }
            clip = provider.attackClip(segment, variant)
        } else {
            clip = provider.baseClip(isAttackState(state) ? 'idle' : state, variant)
        }
        charging = isAttackState(state) && ctx.attackHolding && segment !== undefined
        chargingScale = charging && segment !== undefined
            ? (provider.chargeSeekScale?.(segment) ?? defaultChargeSeekScale(segment))
            : 1
        player = createBoneAnimationPlayer(bridge, clip)
        player.onEvent = record => onAttackEvent?.(record)
        player.play()
        if (isAttackState(state) && segment !== undefined) {
            player.seekProgress(ctx.attackTotalProgress)
        }
        model.updateDeform?.()
    }

    return {
        update: (dt, model, state, ctx): void => {
            const key = provider.clipKey?.(state, ctx) ?? defaultClipKey(state, ctx)
            if (key !== currentKey || model !== currentModel) {
                blendFrom = currentModel === model && player !== undefined ? snapshotJoints(model) : null
                blendT = 0
                currentKey = key
                currentModel = model
                setup(state, model, ctx)
            }
            if (player === undefined || bridge === undefined) return
            if (isAttackState(state) && ctx.attackHolding && ctx.attackSegment !== undefined) {
                if (!charging) {
                    charging = true
                    chargingScale = provider.chargeSeekScale?.(ctx.attackSegment)
                        ?? defaultChargeSeekScale(ctx.attackSegment)
                }
                player.seekProgress(ctx.attackCharge * chargingScale)
            } else {
                charging = false
                if (ctx.stateDuration !== undefined) {
                    player.seekProgress(ctx.stateTime / Math.max(ctx.stateDuration, 0.0001))
                } else {
                    player.updater(dt)
                    if (state === 'walking' || state === 'swimming') {
                        player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
                    }
                }
            }
            overlay?.({
                dt,
                bridge,
                player,
                state,
                ctx,
                variant: variantOfAnimationContext(ctx),
            })
            applyBlend(dt)
            model.updateDeform?.()
        },
    }
}

/** 定义体形动画：同一份 provider 同时服务运行时与骨骼编辑器。 */
export const defineFormAnimation = (provider: FormAnimationProvider): FormAnimation => ({
    ...provider,
    createSystem: (options?: AppearanceSystemOptions) => createFormAnimationSystem(provider, options),
})
