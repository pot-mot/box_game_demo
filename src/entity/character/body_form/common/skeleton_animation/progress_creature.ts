import {Euler} from 'three'
import type {AppearanceSystem, AppearanceSystemOptions, AnimationContext, CreatureModel} from '../../../appearance/types.ts'
import {createCharacterSkeletonBridge} from '../../../appearance/skeleton_bridge.ts'
import {applyJointBlend, snapshotJoints, type JointSnapshot} from '../../../appearance/joint_blend.ts'
import {STATE_BLEND_DURATION, walkSpeedScale} from '../../../appearance/constants.ts'
import {isAttackState, type BaseClipState, type CharacterStateName} from '../../../../../character/state_machine/types.ts'
import {segmentTotalDuration, type AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip, BoneEventRecord} from '../../../../../skeleton/anim/types.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {SkeletonPose} from '../../../../../skeleton/skeleton.ts'
import type {JointEulers, JointPose} from '../creature_runtime/pose.ts'
import {isPoseWithPosition} from '../creature_runtime/pose.ts'
import {segmentPhaseRatios} from '../creature_runtime/timing.ts'
import {
    evaluateProgressComposition,
    type ProgressAnimationComposition,
    type ProgressAnimationEvent,
    type ProgressAnimationLeaf,
    type ProgressAnimationLayer,
    type ProgressAnimationParams,
} from './progress_composition.ts'
import {createProgressClipLeaf} from './progress_clip_leaf.ts'
import {jointEulersToSkeletonPose} from './progress_pose.ts'
import type {FormAnimation, FormPreviewRequest} from './form_animation.ts'
import {bakeProgressPreviewClip} from './preview.ts'

export interface CreatureProgressConfig {
    readonly skeleton: () => SkeletonDefinition
    readonly baseClip: (state: BaseClipState) => BoneAnimationClip
    readonly attackClip: (segment: AttackSegment) => BoneAnimationClip
    /** 转向 / 瞄准 additive 层使用的关节；缺省不生成该层 */
    readonly turnAim?: {readonly body: string; readonly neck: string; readonly head: string}
    /** falling 垂直速度收腿的关节（髋 / 膝）；缺省不生成该层 */
    readonly fallingJoints?: readonly string[]
    /** 由装备控制的挂点（如 mouthMount）：动画不得覆盖其装备旋转；碰撞节点不在此列 */
    readonly preservedJoints?: readonly string[]
    /** 受速度驱动的步态状态；缺省 walking / sprinting / swimming */
    readonly walkStates?: readonly BaseClipState[]
}

interface CreatureRest {
    readonly skeletonPose: SkeletonPose
    readonly eulers: JointEulers
}

export interface CreatureFrame {
    readonly key: string
    readonly graph: ProgressAnimationComposition
    readonly progress: number
    readonly params: ProgressAnimationParams
    readonly restPose: JointEulers
    readonly events: readonly ProgressAnimationEvent[]
}

const restCache = new WeakMap<CreatureProgressConfig, CreatureRest>()
const graphCache = new WeakMap<CreatureProgressConfig, {
    readonly base: Map<string, ProgressAnimationComposition>
    readonly attack: Map<string, {graph: ProgressAnimationComposition; events: readonly ProgressAnimationEvent[]}>
}>()

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const numberParam = (params: ProgressAnimationParams, key: string, fallback: number): number => {
    const value = params[key]
    return typeof value === 'number' ? value : fallback
}
const vectorParam = (
    params: ProgressAnimationParams,
    key: string,
    fallback: readonly [number, number, number],
): readonly [number, number, number] => {
    const value = params[key]
    return Array.isArray(value) ? [value[0], value[1], value[2]] : fallback
}

const restOf = (config: CreatureProgressConfig): CreatureRest => {
    const cached = restCache.get(config)
    if (cached !== undefined) return cached
    const skeletonPose = skeletonFromDefinition(config.skeleton()).readPose()
    const preserved = new Set(config.preservedJoints ?? [])
    const eulers: Record<string, JointPose> = {}
    for (const [jointId, jointPose] of skeletonPose.jointPoses) {
        if (preserved.has(jointId)) continue
        const euler = new Euler().setFromQuaternion(jointPose.rotation, 'XYZ')
        eulers[jointId] = {
            rotation: [euler.x, euler.y, euler.z],
            position: [jointPose.position.x, jointPose.position.y, jointPose.position.z],
        }
    }
    const rest = {skeletonPose, eulers}
    restCache.set(config, rest)
    return rest
}

const restRotation = (rest: JointEulers, jointId: string): readonly [number, number, number] => {
    const pose = rest[jointId]
    if (pose === undefined) return [0, 0, 0]
    return 'rotation' in pose ? pose.rotation : pose
}

const buildParams = (ctx: AnimationContext, stateProgress: number): ProgressAnimationParams => {
    const facingYaw = ctx.facingYaw ?? 0
    const aim = ctx.aimDirection ?? {x: Math.sin(facingYaw), y: 0, z: Math.cos(facingYaw)}
    return {
        horizontalSpeed: ctx.horizontalSpeed,
        verticalSpeed: ctx.verticalSpeed ?? 0,
        turnRate: ctx.turnRate ?? 0,
        facingYaw,
        aimDirection: [aim.x, aim.y, aim.z],
        attackCharge: ctx.attackCharge,
        attackTotalProgress: ctx.attackTotalProgress,
        stateProgress,
    }
}

const walkStatesOf = (config: CreatureProgressConfig): readonly BaseClipState[] =>
    config.walkStates ?? ['walking', 'sprinting', 'swimming']

const baseProgress = (
    state: BaseClipState,
    clip: BoneAnimationClip,
    ctx: AnimationContext,
    config: CreatureProgressConfig,
    walkElapsed?: number,
): number => {
    const duration = ctx.stateDuration ?? clip.duration
    const isWalk = walkStatesOf(config).includes(state)
    const raw = duration > 0
        ? (isWalk && walkElapsed !== undefined
            ? walkElapsed / duration
            : (ctx.stateTime * (isWalk ? walkSpeedScale(ctx.horizontalSpeed) : 1)) / duration)
        : 0
    return clip.loop ? raw - Math.floor(raw) : clamp01(raw)
}

const attackProgress = (ctx: AnimationContext): number => {
    const segment = ctx.attackSegment
    if (segment === undefined) return 0
    if (ctx.attackHolding) return clamp01(ctx.attackCharge * segmentPhaseRatios(segment).windupEnd)
    return clamp01(ctx.attackTotalProgress)
}

const turnAimLeaf = (config: CreatureProgressConfig, rest: JointEulers): ProgressAnimationLeaf | undefined => {
    const joints = config.turnAim
    if (joints === undefined) return undefined
    return {
        id: 'creature:turn_aim',
        joints: [joints.body, joints.neck, joints.head],
        sample: (_progress, params) => {
            const turn = Math.max(-8, Math.min(8, numberParam(params, 'turnRate', 0)))
            const facing = numberParam(params, 'facingYaw', 0)
            const aim = vectorParam(params, 'aimDirection', [0, 0, 1])
            let delta = Math.atan2(aim[0], aim[2]) - facing
            delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
            const body = restRotation(rest, joints.body)
            const neck = restRotation(rest, joints.neck)
            const head = restRotation(rest, joints.head)
            return {
                [joints.body]: [body[0], body[1] + delta * 0.03, body[2] - turn * 0.012],
                [joints.neck]: [neck[0], neck[1] + delta * 0.08, neck[2] + turn * 0.006],
                [joints.head]: [head[0], head[1] + delta * 0.1, head[2] + turn * 0.004],
            }
        },
    }
}

const fallingTuckLeaf = (config: CreatureProgressConfig, rest: JointEulers): ProgressAnimationLeaf | undefined => {
    const jointIds = config.fallingJoints
    if (jointIds === undefined || jointIds.length === 0) return undefined
    return {
        id: 'creature:falling_tuck',
        joints: jointIds,
        sample: (_progress, params) => {
            const tuck = clamp01(Math.max(0, -numberParam(params, 'verticalSpeed', 0)) / 10) * 0.15
            const out: Record<string, JointPose> = {}
            for (const jointId of jointIds) {
                const rotation = restRotation(rest, jointId)
     
                const pose = rest[jointId]
                const rotationWithTuck: [number, number, number] = [rotation[0] + tuck, rotation[1], rotation[2]]
                out[jointId] = pose !== undefined && isPoseWithPosition(pose)
                    ? {rotation: rotationWithTuck, position: pose.position}
                    : rotationWithTuck
            }
            return out
        },
    }
}

const graphCachesOf = (config: CreatureProgressConfig) => {
    let caches = graphCache.get(config)
    if (caches === undefined) {
        caches = {base: new Map(), attack: new Map()}
        graphCache.set(config, caches)
    }
    return caches
}

const baseGraph = (state: BaseClipState, config: CreatureProgressConfig, rest: CreatureRest): {graph: ProgressAnimationComposition; key: string} => {
    const key = `creature:base:${state}`
    const caches = graphCachesOf(config)
    const cached = caches.base.get(key)
    if (cached !== undefined) return {graph: cached, key}
    const layers: ProgressAnimationLayer[] = [{
        source: createProgressClipLeaf(`creature:body:${state}`, config.baseClip(state)),
        from: 0,
        to: 1,
        weight: 1,
        mode: 'normal',
    }]
    const turnAim = turnAimLeaf(config, rest.eulers)
    if (turnAim !== undefined) layers.push({source: turnAim, from: 0, to: 1, weight: 1, mode: 'additive'})
    if (state === 'falling') {
        const tuck = fallingTuckLeaf(config, rest.eulers)
        if (tuck !== undefined) layers.push({source: tuck, from: 0, to: 1, weight: 1, mode: 'additive'})
    }
    const graph: ProgressAnimationComposition = {id: key, layers}
    caches.base.set(key, graph)
    return {graph, key}
}

const attackGraph = (
    segment: AttackSegment,
    config: CreatureProgressConfig,
    rest: CreatureRest,
): {graph: ProgressAnimationComposition; key: string; events: readonly ProgressAnimationEvent[]} => {
    const key = `creature:attack:${segment.id}`
    const caches = graphCachesOf(config)
    const cached = caches.attack.get(key)
    if (cached !== undefined) return {...cached, key}
    const clip = config.attackClip(segment)
    const layers: ProgressAnimationLayer[] = [{
        source: createProgressClipLeaf(`creature:attack_body:${segment.id}`, clip),
        from: 0,
        to: 1,
        weight: 1,
        mode: 'normal',
    }]
    const turnAim = turnAimLeaf(config, rest.eulers)
    if (turnAim !== undefined) layers.push({source: turnAim, from: 0, to: 1, weight: 1, mode: 'additive'})
    const events: ProgressAnimationEvent[] = clip.eventTracks
        .flatMap(track => track.records)
        .map(record => ({
            progress: clip.duration > 0 ? clamp01(record.time / clip.duration) : 0,
            eventName: record.eventName,
            ...(record.params !== undefined ? {params: record.params} : {}),
        }))
        .sort((a, b) => a.progress - b.progress)
    const entry = {graph: {id: key, layers} as ProgressAnimationComposition, events}
    caches.attack.set(key, entry)
    return {...entry, key}
}

export const resolveCreatureFrame = (
    state: CharacterStateName,
    ctx: AnimationContext,
    config: CreatureProgressConfig,
    walkElapsed?: number,
): CreatureFrame => {
    const rest = restOf(config)
    if (isAttackState(state)) {
        const segment = ctx.attackSegment
        if (segment !== undefined) {
            const resolved = attackGraph(segment, config, rest)
            const progress = attackProgress(ctx)
            return {
                key: resolved.key,
                graph: resolved.graph,
                progress,
                params: buildParams(ctx, progress),
                restPose: rest.eulers,
                events: resolved.events,
            }
        }
    }
    const baseState = state as BaseClipState
    const clip = config.baseClip(baseState)
    const resolved = baseGraph(baseState, config, rest)
    const progress = baseProgress(baseState, clip, ctx, config, walkElapsed)
    return {
        key: resolved.key,
        graph: resolved.graph,
        progress,
        params: buildParams(ctx, progress),
        restPose: rest.eulers,
        events: [],
    }
}

const eventRecordOf = (event: ProgressAnimationEvent): BoneEventRecord => ({
    time: event.progress,
    eventName: event.eventName,
    ...(event.params !== undefined ? {params: event.params} : {}),
})

const fireRange = (
    from: number,
    to: number,
    events: readonly ProgressAnimationEvent[],
    onEvent: ((record: BoneEventRecord) => void) | undefined,
): void => {
    if (onEvent === undefined) return
    if (to >= from) {
        for (const event of events) {
            if (event.progress > from && event.progress <= to) onEvent(eventRecordOf(event))
        }
        return
    }
    for (const event of events) {
        if (event.progress > from || event.progress <= to) onEvent(eventRecordOf(event))
    }
}

export const createCreatureProgressSystem = (
    config: CreatureProgressConfig,
    options?: AppearanceSystemOptions,
): AppearanceSystem => {
    let bridge: ReturnType<typeof createCharacterSkeletonBridge> | undefined
    let currentModel: CreatureModel | undefined
    let currentKey: string | undefined
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0
    let lastProgress = 0
    let lastHolding = false
    let walkElapsed = 0
    let walkState: CharacterStateName | undefined

    return {
        update: (dt, model, state, ctx): void => {
            const isWalk = (walkStatesOf(config) as readonly CharacterStateName[]).includes(state)
            if (isWalk) {
                if (walkState !== state) walkElapsed = 0
                walkElapsed += dt * walkSpeedScale(ctx.horizontalSpeed)
                walkState = state
            } else {
                walkElapsed = 0
                walkState = undefined
            }
            if (bridge === undefined || currentModel !== model) {
                bridge = createCharacterSkeletonBridge(model, config.skeleton())
                currentModel = model
                currentKey = undefined
                blendFrom = null
            }
            const frame = resolveCreatureFrame(state, ctx, config, isWalk ? walkElapsed : undefined)
            if (frame.key !== currentKey) {
                blendFrom = currentKey === undefined ? null : snapshotJoints(model)
                blendT = 0
                currentKey = frame.key
                lastProgress = frame.progress
                lastHolding = ctx.attackHolding
                if (isAttackState(state)) options?.onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
            } else {
                if (ctx.attackHolding !== lastHolding) {
                    lastProgress = frame.progress
                } else {
                    fireRange(lastProgress, frame.progress, frame.events, options?.onAttackEvent)
                }
                lastProgress = frame.progress
                lastHolding = ctx.attackHolding
            }
            const pose = evaluateProgressComposition(frame.graph, frame.progress, {
                restPose: frame.restPose,
                params: frame.params,
            })
            bridge.applyPose(jointEulersToSkeletonPose(pose, bridge))
            if (blendFrom !== null) {
                blendT = applyJointBlend(blendFrom, blendT, dt, STATE_BLEND_DURATION)
                if (blendT >= STATE_BLEND_DURATION) blendFrom = null
            }
            model.updateDeform?.()
        },
    }
}

/** 骨骼编辑器预览：采样该体形的生产进度组合树（含转向瞄准 / falling 收腿） */
export const previewCreatureClip = (
    config: CreatureProgressConfig,
    request: FormPreviewRequest,
): BoneAnimationClip => {
    const isAttack = request.kind === 'attack'
    const state: CharacterStateName = isAttack ? 'attacking' : request.state
    const baseClip = isAttack ? undefined : config.baseClip(request.state)
    const duration = isAttack ? segmentTotalDuration(request.segment) : baseClip!.duration
    const loop = isAttack ? false : baseClip!.loop
    const variant = request.variant
    const baseContext: AnimationContext = {
        stateTime: 0,
        stateDuration: duration,
        horizontalSpeed: variant.horizontalSpeed,
        attackSegment: isAttack ? request.segment : undefined,
        attackPhase: undefined,
        attackPhaseProgress: 0,
        attackTotalProgress: 0,
        attackPhaseIndex: 0,
        attackCharge: 0,
        attackHolding: false,
        weaponHeld: variant.weaponHeld,
    }
    return bakeProgressPreviewClip({
        name: `preview:creature:${isAttack ? request.segment.id : state}`,
        duration,
        loop,
        skeleton: config.skeleton(),
        preserveJointIds: config.preservedJoints,
        frameAt: progress => {
            const context: AnimationContext = {
                ...baseContext,
                stateTime: progress * duration,
                attackTotalProgress: progress,
            }
            const frame = resolveCreatureFrame(state, context, config, progress * duration)
            return {
                pose: evaluateProgressComposition(frame.graph, frame.progress, {
                    restPose: frame.restPose,
                    params: frame.params,
                }),
                events: frame.events,
            }
        },
    })
}

/** 用通用进度系统定义体形动画；previewClip 采样同一棵进度组合树供骨骼编辑器使用 */
/** 兽形体形预览工厂：各体形在 `skeleton_animation/preview.ts` 暴露自己的入口，内部共用此实现。 */
export const createCreaturePreviewClip = (config: CreatureProgressConfig): FormAnimation['previewClip'] =>
    request => previewCreatureClip(config, request)

export const defineCreatureProgressAnimation = (
    config: CreatureProgressConfig,
    previewClip: FormAnimation['previewClip'] = createCreaturePreviewClip(config),
): FormAnimation => {
    return {
        skeleton: config.skeleton,
        previewClip,
        createSystem: options => createCreatureProgressSystem(config, options),
    }
}
