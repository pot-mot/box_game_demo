import type {CharacterState} from '../../../character/state_machine/types.ts'
import {Group} from 'three'
import type {CharacterModel, AnimationContext} from './types.ts'
import {createBoneAnimationPlayer} from '../../../skeleton/anim/player.ts'
import type {BoneEventRecord} from '../../../skeleton/anim/types.ts'
import {getBaseClip} from './clips/base_clips.ts'
import {getAttackClip} from './clips/attack_clips.ts'
import {createCharacterSkeletonBridge} from './skeleton_bridge.ts'
import type {SkeletonSceneBridge} from '../../skeleton/render/bridge.ts'
import {resolveIkChain, solveCcd} from '../../../skeleton/ik.ts'
import {DEFAULT_IK_MAX_ITERATIONS, DEFAULT_IK_TOLERANCE} from '../../../skeleton/constants.ts'
import {STATE_BLEND_DURATION} from './constants.ts'

/** 双手武器副手握柄沿武器轴（前臂延伸方向）的偏移距离（米） */
const TWO_HAND_GRIP_OFFSET = 0.45

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
    model.rightArmShoulder, model.rightArmElbow, model.rightWristPivot,
    model.leftArmShoulder, model.leftArmElbow,
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
    onStateChange: (from: CharacterState | null, to: CharacterState, model: CharacterModel, weaponHeld: boolean) => void
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
    /* clip 播放器（全部状态）/ 桥接骨架（以场景为真源） */
    let bridge: SkeletonSceneBridge | undefined
    let player: ReturnType<typeof createBoneAnimationPlayer> | undefined

    const teardownClip = (): void => {
        player?.pause()
        player = undefined
        bridge = undefined
    }

    const setupClip = (state: ClipState, model: CharacterModel, ctx: AnimationContext): void => {
        teardownClip()
        bridge = createCharacterSkeletonBridge(model)
        /* 双手武器：左肩设为 IK 根，左手腕链（左肩→左肘→左腕）可独立求解贴合握柄 */
        const leftShoulder = bridge.findJoint('leftArmShoulder')
        if (leftShoulder !== undefined) leftShoulder.ikRootLevel = 0
        if (state === 'attacking') {
            /* 攻击 clip：技能配置静态时长 + 段固有 tilt + 武器握持前倾；事件轨驱动命中窗口 */
            const phases = ctx.attackPhases
            const clip = getAttackClip({
                skillId: ctx.attackSkillId ?? 'attack',
                duration: ctx.attackDuration,
                recovery: ctx.attackRecovery,
                phases,
                tilt: ctx.swingTilt,
                gripTilt: model.weaponGripTilt,
            })
            player = createBoneAnimationPlayer(bridge, clip)
            player.onEvent = (record) => onAttackEvent?.(record)
            player.play()
        } else {
            player = createBoneAnimationPlayer(bridge, getBaseClip(state, ctx.weaponHeld))
        }
    }

    /** 双手武器 IK（评审决议：applyPose 先写、IK 后写覆盖左臂链）：左手腕追右腕武器轴握柄点 */
    const applyTwoHandedIk = (ctx: AnimationContext): void => {
        if (bridge === undefined || player === undefined) return
        const twoHanded = ctx.attackPhases?.[0]?.animConfig.twoHanded ?? false
        if (!twoHanded) return
        const wristWorld = bridge.getWorldPosition('rightWristPivot')
        const elbowWorld = bridge.getWorldPosition('rightArmElbow')
        if (wristWorld === undefined || elbowWorld === undefined) return
        const gripTarget = wristWorld.clone()
            .add(elbowWorld.clone().sub(wristWorld).normalize().multiplyScalar(TWO_HAND_GRIP_OFFSET))
        const leftWrist = bridge.findJoint('leftHandPivot')
        if (leftWrist === undefined) return
        const chain = resolveIkChain(leftWrist)
        if (chain.length > 1) {
            solveCcd(bridge, chain, gripTarget, {
                maxIterations: DEFAULT_IK_MAX_ITERATIONS,
                tolerance: DEFAULT_IK_TOLERANCE,
            })
        }
    }

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CharacterModel, weaponHeld: boolean): void => {
        /* 在旧动画归零之前抓取当前关节姿态，作为混合起点 */
        if (from !== null && currentModel === model) {
            blendFrom = snapshotJoints(model)
            blendT = 0
        } else {
            blendFrom = null
        }
        currentState = to
        currentModel = model
        const ctx = placeholderCtx(weaponHeld)
        if (isClipState(to)) {
            /* 攻击进入/链段切换：先关闭旧命中窗口（新 clip 的 hitbox_on 稍后重新打开） */
            if (to === 'attacking') {
                onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
            }
            setupClip(to, model, ctx)
            player?.seek(0)
        } else {
            teardownClip()
        }
    }

    const update = (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext): void => {
        /* 动画键：attacking 状态下附加技能 id；基础状态 weaponHeld 区分持械变体 */
        const animKey = state === 'attacking' && ctx.attackSkillId !== undefined
            ? `attacking:${ctx.attackSkillId}`
            : `${state}${ctx.weaponHeld ? ':w' : ':n'}`
        if (animKey !== currentAnimKey || model !== currentModel) {
            onStateChange(currentState, state, model, ctx.weaponHeld)
            currentAnimKey = animKey
        }

        /* 统一 clip 路径：播放器推进 → applyPose 写骨架 → 桥接写回 Group（场景图级联） */
        if (player !== undefined) {
            player.updater(dt)
            /* 双手武器 IK（applyPose 后、混合前：IK 覆盖左臂链，评审分层顺序） */
            if (state === 'attacking') {
                applyTwoHandedIk(ctx)
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

const placeholderCtx = (weaponHeld: boolean): AnimationContext => ({
    stateTime: 0, swingTilt: 0,
    attackSkillId: undefined, attackPhase: undefined, attackPhaseProgress: 0,
    attackTotalProgress: 0, attackPhases: undefined, attackPhaseIndex: 0,
    attackDuration: 1, attackRecovery: 0, weaponHeld,
})