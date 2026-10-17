import type {CharacterState} from '../../../character/state_machine/types.ts'
import {Group} from 'three'
import type {CharacterModel, AnimationContext} from './types.ts'
import {createComposedAnimationPlayer, type ComposedAnimationPlayer, type ComposedPlayerLayer} from '../../../skeleton/anim/composed_player.ts'
import {applyComposedPose} from '../../../skeleton/anim/composition.ts'
import type {BoneEventRecord} from '../../../skeleton/anim/types.ts'
import {getBaseClipForHoldMode, getWalkLegsClip, fallingSpeedTier} from './clips/base_clips.ts'
import {getAttackClipById, getChargeClipById} from './clips/attack_clips.ts'
import {createCharacterSkeletonBridge} from './skeleton_bridge.ts'
import type {SkeletonSceneBridge} from '../../skeleton/render/bridge.ts'
import {solveTwoHandedGrip} from './two_handed_ik.ts'
import {offHandSide} from '../../../character/handedness.ts'
import {ENGAGED_WALK_MIN_SPEED, STATE_BLEND_DURATION, TWO_HAND_GRIP_OFFSET, walkSpeedScale} from './constants.ts'

/** clip 驱动的状态（全部 14 状态；基础状态用基础生成器，attacking / air_attacking 用攻击生成器） */
const CLIP_STATES: readonly CharacterState[] = ['idle', 'walking', 'jumping', 'falling', 'swimming', 'floating', 'dying', 'rolling', 'flinching', 'attacking', 'air_attacking', 'interacting', 'knockdown', 'getting_up', 'blocking', 'guard_broken']

type ClipState = 'idle' | 'walking' | 'jumping' | 'falling' | 'swimming' | 'floating' | 'dying' | 'rolling' | 'flinching' | 'attacking' | 'air_attacking' | 'interacting' | 'knockdown' | 'getting_up' | 'blocking' | 'guard_broken'

const isClipState = (state: CharacterState): state is ClipState => CLIP_STATES.includes(state)

/** 攻击态（地面攻击 + 空中攻击共用攻击 clip 生成器与双手 IK） */
type AttackClipState = 'attacking' | 'air_attacking'
const isAttackState = (state: ClipState): state is AttackClipState => state === 'attacking' || state === 'air_attacking'

/** 参与过渡混合的关节快照（旋转 + 位置，位置仅 spine 使用） */
interface JointSnapshot {
    readonly joint: Group
    readonly rx: number
    readonly ry: number
    readonly rz: number
    readonly px: number
    readonly py: number
    readonly pz: number
}

/** 收集模型全部可动画关节（顺序固定，与 CHARACTER_JOINT_IDS 一致） */
const snapshotJoints = (model: CharacterModel): JointSnapshot[] => [
    model.rightArmShoulder, model.rightArmElbow, model.rightHandPivot, model.rightWristPivot, model.rightWeaponMount,
    model.leftArmShoulder, model.leftArmElbow, model.leftHandPivot, model.leftWristPivot, model.leftWeaponMount,
    model.rightLegHip, model.rightLegKnee, model.leftLegHip, model.leftLegKnee,
    model.headNeck, model.spine, model.group,
].map(joint => ({
    joint,
    rx: joint.rotation.x, ry: joint.rotation.y, rz: joint.rotation.z,
    px: joint.position.x, py: joint.position.y, pz: joint.position.z,
}))

export interface AppearanceSystemOptions {
    /** 攻击动画事件回调（hitbox_on/off → 近战命中窗口开关） */
    onAttackEvent?: (record: BoneEventRecord) => void
}

export interface AppearanceSystem {
    onStateChange: (from: CharacterState | null, to: CharacterState, model: CharacterModel, ctx: AnimationContext) => void
    update: (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext) => void
}

/** 无专用蓄力 clip 时，蓄力进度映射到攻击 clip 前段的比例上限（0.5 ≈ 动作中段/满蓄力位） */
const CHARGE_SEEK_FRACTION = 0.5

/* 持盾臂集合（canonical 右撇子：主手 = 右、副手 = 左；左撇子由 clip 镜像处理）——复用常量避免逐帧分配 */
const NO_SHIELD_ARMS: readonly ('right' | 'left')[] = []
const RIGHT_SHIELD_ARM: readonly ('right' | 'left')[] = ['right']
const LEFT_SHIELD_ARM: readonly ('right' | 'left')[] = ['left']
const BOTH_SHIELD_ARMS: readonly ('right' | 'left')[] = ['right', 'left']

/** 基础姿态据此校正所持盾的盾面朝向，格挡姿态据此决定举盾臂（返回共享常量） */
const shieldArmsOf = (ctx: AnimationContext): readonly ('right' | 'left')[] => {
    if (ctx.shieldHands.main) return ctx.shieldHands.off ? BOTH_SHIELD_ARMS : RIGHT_SHIELD_ARM
    return ctx.shieldHands.off ? LEFT_SHIELD_ARM : NO_SHIELD_ARMS
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
    let currentModel: CharacterModel | null = null
    /* 动画键：state + attacking 时的技能 id + weaponHeld 变体（attacking 恒持械不加后缀） */
    let currentAnimKey: string | null = null
    /* 状态切换瞬间的关节快照：新状态动画输出向快照混合，消除关节角突跳 */
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0
    /* 组合动画播放器（全部状态）/ 桥接骨架（以场景为真源） */
    let bridge: SkeletonSceneBridge | undefined
    let player: ComposedAnimationPlayer | undefined
    /* 当前是否在播放「蓄力姿势」（按住蓄力）：为真时播放器不自由推进，而按蓄力值定位进度 */
    let chargingPose = false
    /* 蓄力进度缩放：专用蓄力 clip（0→1）取 1；无专用 clip 时定位到攻击 clip 前段 */
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

    /** 攻击段动作组合 → 播放器层（段引用的 pose 资产 + 权重 + 时间进度偏移） */
    const attackLayersOf = (ctx: AnimationContext): readonly ComposedPlayerLayer[] => {
        const segment = ctx.attackSegment
        if (segment === undefined) return []
        return segment.poses.map(pose => ({
            clip: getAttackClipById(pose.poseId, ctx.handedness),
            weight: pose.weight,
            progressOffset: pose.progressOffset,
        }))
    }

    const setupClip = (state: ClipState, model: CharacterModel, ctx: AnimationContext): void => {
        teardownClip()
        bridge = createCharacterSkeletonBridge(model)
        /* 双手共持：支撑肩设为 IK 根（持械且持握模式为双手时，攻击态与全部非攻击持械状态），
         * 支撑手链可独立求解贴合握柄。
         * 支撑侧 = 与主手相反的手臂（右撇子为左臂、左撇子为右臂）。
         * 副手武器（若装备）在双手模式下挂背，不影响 IK；双持模式副手握持自身武器，不走共享 IK。 */
        if (ctx.weaponHeld && ctx.holdMode === 'two_handed') {
            const supportShoulder = bridge.findJoint(`${offHandSide(ctx.handedness)}ArmShoulder`)
            if (supportShoulder !== undefined) supportShoulder.ikRootLevel = 0
        }
        if (isAttackState(state)) {
            /* 攻击段动作组合：段引用的 pose 层（含 hitbox 事件轨），按权重合成；按住蓄力时按蓄力值定位姿势 */
            const segment = ctx.attackSegment
            chargingPose = ctx.attackHolding && segment !== undefined
            if (chargingPose && segment !== undefined && segment.chargePoseId !== undefined) {
                /* 专用蓄力姿势 clip：设计为 0（起始位）→ 1（满蓄力位），进度直接取蓄力值 */
                chargingSeekScale = 1
                player = createComposedAnimationPlayer(bridge, [{clip: getChargeClipById(segment.chargePoseId, ctx.handedness), weight: 1}])
            } else {
                /* 无专用蓄力 clip：定位到攻击 clip 前段（拉弓 / 后引 / 后摆），同样随蓄力参数化 */
                chargingSeekScale = CHARGE_SEEK_FRACTION
                const layers = attackLayersOf(ctx)
                if (layers.length === 0) return
                player = createComposedAnimationPlayer(bridge, layers)
            }
            player.onEvent = (record) => onAttackEvent?.(record)
            player.play()
        } else {
            chargingPose = false
            /* 基础状态：持握模式感知的完整 clip（下半身 + 上半身已离线预组合，运行时不产生组合开销） */
            const clip = getBaseClipForHoldMode(
                state,
                ctx.weaponHeld,
                ctx.holdMode,
                ctx.horizontalSpeed,
                shieldArmsOf(ctx),
                ctx.handedness,
            )
            player = createComposedAnimationPlayer(bridge, [{clip, weight: 1}])
            player.play()
            /* 行走 / 游泳：步频随水平速度变速 */
            if (state === 'walking' || state === 'swimming') {
                player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
            }
        }
    }

    /** 双手武器 IK（applyPose 先写、IK 后写覆盖支撑臂链）：支撑手链追武器轴上的副握点 */
    const applyTwoHandedIk = (ctx: AnimationContext, model: CharacterModel): void => {
        if (bridge === undefined || player === undefined) return
        /* 双持：副手握持自身武器，不做共享 IK */
        if (ctx.holdMode !== 'two_handed') return
        const supportSide = offHandSide(ctx.handedness)
        solveTwoHandedGrip(bridge, model.weaponGroup ?? undefined, {
            shoulderId: `${supportSide}ArmShoulder`,
            supportSide,
            /* 武器模型原点已对齐主握把，副握点按该武器握把间距沿本地 +Y 定位 */
            offset: model.weaponSupportGripOffset + TWO_HAND_GRIP_OFFSET,
            /* 模型根含 scale（展示模式 1.3×）：目标换算回骨架空间 */
            rootObject: model.group,
        })
    }

    /** 是否处于「上半身保持姿态、下半身行走」叠加：格挡 / 蓄力攻击中且确实在水平移动 */
    const engagedWalking = (state: CharacterState, ctx: AnimationContext): boolean => {
        if (ctx.horizontalSpeed < ENGAGED_WALK_MIN_SPEED) return false
        return state === 'blocking' || (state === 'attacking' && ctx.attackHolding)
    }

    /**
     * 用行走步态覆盖双腿（在播放器 applyPose、双手 IK 之后调用）：上半身姿态原样保留。
     * 关节集（双腿）与上半身/体态层不重叠，叠加即精确合成；步频随水平速度变速。
     */
    const applyEngagedWalk = (dt: number, state: CharacterState, ctx: AnimationContext): void => {
        if (bridge === undefined) return
        if (!engagedWalking(state, ctx)) {
            engagedWalkPhase = 0
            return
        }
        const clip = getWalkLegsClip(ctx.handedness)
        engagedWalkPhase += dt * walkSpeedScale(ctx.horizontalSpeed)
        applyComposedPose(bridge, [{clip, weight: 1, progress: engagedWalkPhase / clip.duration}])
    }

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CharacterModel, ctx: AnimationContext): void => {
        /* 在旧动画归零之前抓取当前关节姿态，作为混合起点 */
        if (from !== null && currentModel === model) {
            blendFrom = snapshotJoints(model)
            blendT = 0
        } else {
            blendFrom = null
        }
        currentState = to
        currentModel = model
        if (isClipState(to)) {
            /* 攻击进入/链段切换：先关闭旧命中窗口（新 clip 的 hitbox_on 稍后重新打开） */
            if (to === 'attacking' || to === 'air_attacking') {
                onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
            }
            /* 用真实 ctx 生成 clip（falling 速度档 / attacking 阶段配置等依赖当前上下文） */
            setupClip(to, model, ctx)
            player?.seekProgress(0)
        } else {
            teardownClip()
        }
    }

    const update = (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext): void => {
        /* 动画键：attacking 用当前段 id（段切换触发混合）；基础状态 weaponHeld 变体；falling 附加速度档（腿张开随速度） */
        const weaponKey = ctx.weaponHeld ? `:${ctx.holdMode}` : ':n'
        const shieldKey = SHIELD_ARM_KEY_SUFFIXES.get(shieldArmsOf(ctx)) ?? ''
        const clipKey = (state === 'attacking' || state === 'air_attacking') && ctx.attackSegment !== undefined
            ? `attacking:${ctx.attackSegment.id}${ctx.attackHolding ? ':charging' : ''}`
            : state === 'falling'
                ? `falling:${fallingSpeedTier(ctx.horizontalSpeed)}${weaponKey}`
                : `${state}${weaponKey}${shieldKey}`
        /* 惯用手影响 clip（左撇子取镜像）：纳入键，切换时重解析并触发混合 */
        const animKey = `${clipKey}:${ctx.handedness}`
        if (animKey !== currentAnimKey || model !== currentModel) {
            onStateChange(currentState, state, model, ctx)
            currentAnimKey = animKey
        }

        /* 统一 clip 路径：播放器推进 → applyPose 写骨架 → 桥接写回 Group（场景图级联） */
        if (player !== undefined) {
            if (chargingPose) {
                /* 蓄力姿势：按蓄力值定位到 clip 对应进度（0 = 起始位，1 = 满蓄力位），不自由推进 */
                player.seekProgress(ctx.attackCharge * chargingSeekScale)
            } else {
                player.updater(dt)
                /* 行走 / 游泳：步频随水平速度变速 */
                if (state === 'walking' || state === 'swimming') {
                    player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
                }
            }
            /* 双手武器 IK（applyPose 后、混合前：IK 覆盖支撑臂链，评审分层顺序）：
             * 攻击态与全部非攻击持械状态都让副手吸附握把（`applyTwoHandedIk` 内部据 holdMode 早退） */
            if (ctx.weaponHeld && ctx.holdMode === 'two_handed') {
                applyTwoHandedIk(ctx, model)
            }
            /* 格挡 / 蓄力攻击下半身行走叠加：双腿改为行走步态，上半身姿态保留（含双手 IK） */
            applyEngagedWalk(dt, state, ctx)
        }

        /* 状态过渡混合：新动画输出向切换前快照加权收敛（三次 ease-out） */
        if (blendFrom !== null && blendT < STATE_BLEND_DURATION) {
            blendT += dt
            const k = 1 - Math.pow(1 - Math.min(blendT / STATE_BLEND_DURATION, 1), 3)
            for (const snap of blendFrom) {
                const j = snap.joint
                j.rotation.x = snap.rx + (j.rotation.x - snap.rx) * k
                j.rotation.y = snap.ry + (j.rotation.y - snap.ry) * k
                j.rotation.z = snap.rz + (j.rotation.z - snap.rz) * k
                j.position.x = snap.px + (j.position.x - snap.px) * k
                j.position.y = snap.py + (j.position.y - snap.py) * k
                j.position.z = snap.pz + (j.position.z - snap.pz) * k
            }
            if (blendT >= STATE_BLEND_DURATION) blendFrom = null
        }
    }

    return {onStateChange, update}
}
