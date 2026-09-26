import type {CharacterState} from '../../../character/state_machine/types.ts'
import {Group} from 'three'
import type {CharacterModel, AnimationContext} from './types.ts'
import {createComposedAnimationPlayer, type ComposedAnimationPlayer, type ComposedPlayerLayer} from '../../../skeleton/anim/composed_player.ts'
import type {BoneEventRecord} from '../../../skeleton/anim/types.ts'
import {getBaseClipForHoldMode, fallingSpeedTier} from './clips/base_clips.ts'
import {getAttackClipById} from './clips/attack_clips.ts'
import {createCharacterSkeletonBridge} from './skeleton_bridge.ts'
import type {SkeletonSceneBridge} from '../../skeleton/render/bridge.ts'
import {solveTwoHandedGrip} from './two_handed_ik.ts'
import {STATE_BLEND_DURATION, TWO_HAND_GRIP_OFFSET, walkSpeedScale} from './constants.ts'

/** clip 驱动的状态（全部 8 状态；基础状态用基础生成器，attacking 用攻击生成器） */
const CLIP_STATES: readonly CharacterState[] = ['idle', 'walking', 'jumping', 'falling', 'dying', 'dashing', 'flinching', 'attacking']

type ClipState = 'idle' | 'walking' | 'jumping' | 'falling' | 'dying' | 'dashing' | 'flinching' | 'attacking'

const isClipState = (state: CharacterState): state is ClipState => CLIP_STATES.includes(state)

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

    const teardownClip = (): void => {
        player?.pause()
        player = undefined
        bridge = undefined
    }

    /** 攻击段动作组合 → 播放器层（段引用的 pose 资产 + 权重 + 时间进度偏移） */
    const attackLayersOf = (ctx: AnimationContext): readonly ComposedPlayerLayer[] => {
        const segment = ctx.attackSegment
        if (segment === undefined) return []
        return segment.poses.map(pose => ({
            clip: getAttackClipById(pose.poseId),
            weight: pose.weight,
            progressOffset: pose.progressOffset,
        }))
    }

    const setupClip = (state: ClipState, model: CharacterModel, ctx: AnimationContext): void => {
        teardownClip()
        bridge = createCharacterSkeletonBridge(model)
        /* 双手共持：左肩设为 IK 根（仅攻击态、武器双手且非双持时），左手链可独立求解贴合握柄。
         * 双持武器左手握持自身武器，不走共享 IK（左臂由 clip 的武器骨骼/左臂关键帧驱动）。 */
        if (state === 'attacking' && ctx.holdMode === 'two_handed' && model.offhandWeaponGroup === null) {
            const leftShoulder = bridge.findJoint('leftArmShoulder')
            if (leftShoulder !== undefined) leftShoulder.ikRootLevel = 0
        }
        if (state === 'attacking') {
            /* 攻击段动作组合：段引用的 pose 层（含 hitbox 事件轨），按权重合成 */
            const layers = attackLayersOf(ctx)
            if (layers.length === 0) return
            player = createComposedAnimationPlayer(bridge, layers)
            player.onEvent = (record) => onAttackEvent?.(record)
            player.play()
        } else {
            /* 基础状态：持握模式感知的完整 clip（下半身 + 上半身已离线预组合，运行时不产生组合开销） */
            const clip = getBaseClipForHoldMode(state, ctx.weaponHeld, ctx.holdMode, ctx.horizontalSpeed)
            player = createComposedAnimationPlayer(bridge, [{clip, weight: 1}])
            player.play()
            /* 行走：步频随水平速度变速 */
            if (state === 'walking') {
                player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
            }
        }
    }

    /** 双手武器 IK（applyPose 先写、IK 后写覆盖左臂链）：左手链追武器轴上的副握点 */
    const applyTwoHandedIk = (ctx: AnimationContext, model: CharacterModel): void => {
        if (bridge === undefined || player === undefined) return
        /* 双持：左手握持自身武器，不做共享 IK */
        if (ctx.holdMode !== 'two_handed' || model.offhandWeaponGroup !== null) return
        solveTwoHandedGrip(bridge, model.weaponGroup ?? undefined, {
            shoulderId: 'leftArmShoulder',
            /* 副握点沿武器轴相对武器原点：握把局部 y + 握把相对偏移（0 = 主手握把处） */
            offset: model.weaponGripY + TWO_HAND_GRIP_OFFSET,
        })
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
            if (to === 'attacking') {
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
        const animKey = state === 'attacking' && ctx.attackSegment !== undefined
            ? `attacking:${ctx.attackSegment.id}`
            : state === 'falling'
                ? `falling:${fallingSpeedTier(ctx.horizontalSpeed)}${weaponKey}`
                : `${state}${weaponKey}`
        if (animKey !== currentAnimKey || model !== currentModel) {
            onStateChange(currentState, state, model, ctx)
            currentAnimKey = animKey
        }

        /* 统一 clip 路径：播放器推进 → applyPose 写骨架 → 桥接写回 Group（场景图级联） */
        if (player !== undefined) {
            player.updater(dt)
            /* 行走：步频随水平速度变速 */
            if (state === 'walking') {
                player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
            }
            /* 双手武器 IK（applyPose 后、混合前：IK 覆盖左臂链，评审分层顺序） */
            if (state === 'attacking') {
                applyTwoHandedIk(ctx, model)
            }
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