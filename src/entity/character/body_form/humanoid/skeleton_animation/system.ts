import {isAttackState, type CharacterState} from '../../../../../character/state_machine/types.ts'
import type {AppearanceSystem, AppearanceSystemOptions, CreatureModel, AnimationContext, HumanoidAnimationContext} from '../../../appearance/types.ts'
import {applyJointBlend, snapshotJoints, type JointSnapshot} from '../../../appearance/joint_blend.ts'
import {createBoneAnimationPlayer, type BoneAnimationPlayer} from '../../../../../skeleton/anim/player.ts'
import {sampleClip} from '../../../../../skeleton/anim/sampling.ts'
import {getBaseClipForHoldMode, getWalkLegsClip, fallingSpeedTier} from './clips/base_clips.ts'
import {getAttackClipById} from '../skeleton_animation/clips/attack_clips.ts'
import {createCharacterSkeletonBridge} from '../../../appearance/skeleton_bridge.ts'
import type {SkeletonSceneBridge} from '../../../../skeleton/render/bridge.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'
import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {isWindupStrike, phaseDurationOf, resolvePhases} from '../../../../../character/combat/attack_phases.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import {STATE_BLEND_DURATION, walkSpeedScale} from '../../../appearance/constants.ts'
import {ENGAGED_WALK_MIN_SPEED} from '../state/constants.ts'


/**
 * 人形骨架静止姿态：攻击 clip 是稀疏作者数据，未声明关节必须在进入攻击时回到此姿态。
 * 该姿态只读复用；applyPose 会复制数值到桥接骨架。
 */
const HUMANOID_REST_POSE = skeletonFromDefinition(buildCharacterSkeletonDefinition()).readPose()

/** 蓄力进度映射到攻击 clip 前段的通用比例上限（0.5 ≈ 动作中段/满蓄力位；用于非「抬手 → 挥斩」结构的远程段） */
const CHARGE_SEEK_FRACTION = 0.5

/**
 * 近战重击的蓄力定位比例：满蓄力 = 抬手段末帧（= 松开后续播挥斩的起点）。
 * 蓄力姿势直接取攻击 clip 的抬手段，故与各武器实际的抬手姿势逐帧一致，
 * 松开蓄力时不会出现「先回位再抬手」的跳变；仅「抬手 → 挥斩」结构的近战段返回比例，其余返回 undefined。
 */
const meleeWindupFraction = (segment: AttackSegment): number | undefined => {
    const phases = resolvePhases(segment.phases)
    if (!isWindupStrike(phases)) return undefined
    const total = segment.duration + segment.recovery
    if (total <= 0) return undefined
    return phaseDurationOf(phases[0], segment.duration, segment.recovery) / total
}

/* 持盾臂集合（canonical 右撇子：主手 = 右、副手 = 左；左撇子由 clip 镜像处理）——复用常量避免逐帧分配 */
const NO_SHIELD_ARMS: readonly ('right' | 'left')[] = []
const RIGHT_SHIELD_ARM: readonly ('right' | 'left')[] = ['right']
const LEFT_SHIELD_ARM: readonly ('right' | 'left')[] = ['left']
const BOTH_SHIELD_ARMS: readonly ('right' | 'left')[] = ['right', 'left']

/** 基础姿态据此校正所持盾的盾面朝向，格挡姿态据此决定举盾臂（返回共享常量） */
const humanoidCtxOf = (ctx: AnimationContext): HumanoidAnimationContext => ctx.humanoid ?? {
    holdMode: 'one_handed',
    handedness: 'right',
    shieldHands: {main: false, off: false},
}

const shieldArmsOf = (ctx: AnimationContext): readonly ('right' | 'left')[] => {
    if (humanoidCtxOf(ctx).shieldHands.main) return humanoidCtxOf(ctx).shieldHands.off ? BOTH_SHIELD_ARMS : RIGHT_SHIELD_ARM
    return humanoidCtxOf(ctx).shieldHands.off ? LEFT_SHIELD_ARM : NO_SHIELD_ARMS
}

/** 持盾臂集合 → 动画键后缀（按引用查表，避免逐帧字符串拼接） */
const SHIELD_ARM_KEY_SUFFIXES = new Map<readonly ('right' | 'left')[], string>([
    [NO_SHIELD_ARMS, ''],
    [RIGHT_SHIELD_ARM, ':sr'],
    [LEFT_SHIELD_ARM, ':sl'],
    [BOTH_SHIELD_ARMS, ':srl'],
])

export const createAppearanceSystem = (options?: AppearanceSystemOptions): AppearanceSystem => {
    const onAttackEvent = options?.onAttackEvent
    let currentState: CharacterState | null = null
    let currentModel: CreatureModel | null = null
    /* 动画键：state + attacking 时的技能 id + weaponHeld 变体（attacking 恒持械不加后缀） */
    let currentAnimKey: string | null = null
    /* 状态切换瞬间的关节快照：新状态动画输出向快照混合，消除关节角突跳 */
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0
    /* 组合动画播放器（全部状态）/ 桥接骨架（以场景为真源） */
    let bridge: SkeletonSceneBridge | undefined
    let player: BoneAnimationPlayer | undefined
    /* 当前是否在播放「蓄力姿势」（按住蓄力）：为真时播放器不自由推进，而按蓄力值定位进度 */
    let chargingPose = false
    /* 蓄力进度缩放：定位到攻击 clip 蓄力段末的比例（近战 = 抬手段占全段比例；远程 = 前段通用比例） */
    let chargingSeekScale = 1
    /* 格挡 / 蓄力攻击下半身行走叠加的相位累积（秒）：按水平速度步频推进，仅覆盖双腿 */
    let engagedWalkPhase = 0

    const teardownClip = (): void => {
        player?.pause()
        player = undefined
        bridge = undefined
        chargingPose = false
        engagedWalkPhase = 0
    }

    /** 攻击段 → 单 clip（当前段只引用一个 pose 资产；多层组合未在生产使用）。 */
    const attackClipOf = (ctx: AnimationContext): ReturnType<typeof getAttackClipById> | undefined => {
        const poseId = ctx.attackSegment?.poseId
        return poseId === undefined ? undefined : getAttackClipById(poseId, humanoidCtxOf(ctx).handedness)
    }

    const setupClip = (state: CharacterState, model: CreatureModel, ctx: AnimationContext): void => {
        teardownClip()
        bridge = createCharacterSkeletonBridge(model)
        if (isAttackState(state)) {
            /* 攻击段动作组合：段引用的 pose 层（含 hitbox 事件轨），按权重合成。
             * 蓄力按住时不自由推进，而按蓄力值定位「蓄力段」进度：近战 = 攻击 clip 的抬手段（武器各异），
             * 其余（拉弓 / 后引 / 后摆）= 攻击 clip 前段；松开后由攻击态正常推进，无缝续播挥斩。 */
            const segment = ctx.attackSegment
            chargingPose = ctx.attackHolding && segment !== undefined
            chargingSeekScale = chargingPose && segment !== undefined
                ? meleeWindupFraction(segment) ?? CHARGE_SEEK_FRACTION
                : 1
            const clip = attackClipOf(ctx)
            if (clip === undefined) return
            /* 攻击作者数据是稀疏的：未控制关节回到骨架静止姿态，再叠加攻击轨道。 */
            bridge.applyPose(HUMANOID_REST_POSE)
            player = createBoneAnimationPlayer(bridge, clip)
            player.onEvent = (record) => onAttackEvent?.(record)
            player.play()
        } else {
            chargingPose = false
            /* 基础状态：持握模式感知的完整 clip（下半身 + 上半身已离线预组合，支撑手按武器类取预烘焙轨） */
            const clip = getBaseClipForHoldMode(
                state,
                ctx.weaponHeld,
                humanoidCtxOf(ctx).holdMode,
                ctx.horizontalSpeed,
                shieldArmsOf(ctx),
                humanoidCtxOf(ctx).handedness,
                humanoidCtxOf(ctx).weaponClassId,
            )
            player = createBoneAnimationPlayer(bridge, clip)
            player.play()
            /* 行走 / 游泳：步频随水平速度变速 */
            if (state === 'walking' || state === 'swimming') {
                player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
            }
        }
    }

    /** 是否处于「上半身保持姿态、下半身行走」叠加：格挡 / 蓄力攻击中且确实在水平移动 */
    const engagedWalking = (state: CharacterState, ctx: AnimationContext): boolean => {
        if (ctx.horizontalSpeed < ENGAGED_WALK_MIN_SPEED) return false
        return state === 'blocking' || (state === 'attacking' && ctx.attackHolding)
    }

    /**
     * 用行走步态覆盖双腿（在播放器 applyPose 之后调用）：上半身姿态原样保留。
     * 关节集（双腿）与上半身/体态层不重叠，叠加即精确合成；步频随水平速度变速。
     */
    const applyEngagedWalk = (dt: number, state: CharacterState, ctx: AnimationContext): void => {
        if (bridge === undefined) return
        if (!engagedWalking(state, ctx)) {
            engagedWalkPhase = 0
            return
        }
        const clip = getWalkLegsClip(humanoidCtxOf(ctx).handedness)
        engagedWalkPhase += dt * walkSpeedScale(ctx.horizontalSpeed)
        bridge.applyPose(sampleClip(clip, engagedWalkPhase))
    }

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CreatureModel, ctx: AnimationContext): void => {
        /* 在旧动画归零之前抓取当前关节姿态，作为混合起点 */
        if (from !== null && currentModel === model) {
            blendFrom = snapshotJoints(model)
            blendT = 0
        } else {
            blendFrom = null
        }
        currentState = to
        currentModel = model
        /* 攻击进入/链段切换：先关闭旧命中窗口（新 clip 的 hitbox_on 稍后重新打开） */
        if (isAttackState(to)) {
            onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
        }
        /* 用真实 ctx 生成 clip（falling 速度档 / attacking 阶段配置等依赖当前上下文）。
         * 攻击 clip 按段总进度定位：松开蓄力时阶段时间线已推进到抬手进度，不能回到 0 重播。 */
        setupClip(to, model, ctx)
        player?.seekProgress(isAttackState(to) ? ctx.attackTotalProgress : 0)
    }

    const update = (dt: number, model: CreatureModel, state: CharacterState, ctx: AnimationContext): void => {
        /* 动画键：attacking 用当前段 id（段切换触发混合）；基础状�?weaponHeld 变体；falling 附加速度档（腿张开随速度�?*/
        const weaponKey = ctx.weaponHeld ? `:${humanoidCtxOf(ctx).holdMode}` : ':n'
        const shieldKey = SHIELD_ARM_KEY_SUFFIXES.get(shieldArmsOf(ctx)) ?? ''
        const weaponClassKey = ctx.weaponHeld && humanoidCtxOf(ctx).holdMode === 'two_handed' && humanoidCtxOf(ctx).weaponClassId !== undefined
            ? `:w${humanoidCtxOf(ctx).weaponClassId}`
            : ''
        const clipKey = (state === 'attacking' || state === 'air_attacking') && ctx.attackSegment !== undefined
            ? `attacking:${ctx.attackSegment.id}${ctx.attackHolding ? ':charging' : ''}${weaponClassKey}`
            : state === 'falling'
                ? `falling:${fallingSpeedTier(ctx.horizontalSpeed)}${weaponKey}${weaponClassKey}`
                : `${state}${weaponKey}${shieldKey}${weaponClassKey}`
        /* 惯用手影�?clip（左撇子取镜像）：纳入键，切换时重解析并触发混合 */
        const animKey = `${clipKey}:${humanoidCtxOf(ctx).handedness}`
        if (animKey !== currentAnimKey || model !== currentModel) {
            onStateChange(currentState, state, model, ctx)
            currentAnimKey = animKey
        }

        /* 统一 clip 路径：播放器推进 → applyPose 写骨架 → 桥接写回 Group（场景图级联） */
        if (player !== undefined) {
            if (chargingPose) {
                /* 蓄力姿势：按蓄力值定位到 clip 对应进度（0 = 起始位，1 = 满蓄力位），不自由推进 */
                player.seekProgress(ctx.attackCharge * chargingSeekScale)
            } else if (ctx.stateDuration !== undefined) {
                /* 时间驱动状态（受击 / 翻滚 / 交互 / 倒地 / 起身 / 破防）按状态时间定位 clip */
                player.seekProgress(ctx.stateTime / Math.max(ctx.stateDuration, 0.0001))
            } else {
                player.updater(dt)
                /* 行走 / 游泳：步频随水平速度变速 */
                if (state === 'walking' || state === 'swimming') {
                    player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
                }
            }
            /* 格挡 / 蓄力攻击下半身行走叠加：双腿改为行走步态，上半身姿态保留 */
            applyEngagedWalk(dt, state, ctx)
        }

        /* 状态过渡混合：新动画输出向切换前快照加权收敛（三次 ease-out） */
        if (blendFrom !== null && blendT < STATE_BLEND_DURATION) {
            blendT = applyJointBlend(blendFrom, blendT, dt, STATE_BLEND_DURATION)
            if (blendT >= STATE_BLEND_DURATION) blendFrom = null
        }
    }

    return {update}
}
