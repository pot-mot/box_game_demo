import type {CharacterState} from '../../../character/state_machine/types.ts'
import type {Group} from 'three'
import type {CharacterModel, AnimationHandler, AnimationContext} from './types.ts'
import {createBoneAnimationPlayer} from '../../../skeleton/anim/player.ts'
import {getBaseClip} from './clips/base_clips.ts'
import {createCharacterSkeletonBridge} from './skeleton_bridge.ts'
import type {SkeletonSceneBridge} from '../../skeleton/render/bridge.ts'
import {attackingAnim} from './animators/attacking.ts'
import {HORIZONTAL_SPEED_SMOOTHING, STATE_BLEND_DURATION} from './constants.ts'

/** clip 驱动的状态（attacking 在 M4b 迁移前保留旧 animator 路径） */
const CLIP_STATES: readonly CharacterState[] = ['idle', 'walking', 'jumping', 'falling', 'dying', 'dashing', 'flinching']

type ClipState = 'idle' | 'walking' | 'jumping' | 'falling' | 'dying' | 'dashing' | 'flinching'

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

export interface AppearanceSystem {
    onStateChange: (from: CharacterState | null, to: CharacterState, model: CharacterModel, weaponHeld: boolean) => void
    update: (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext) => void
}

export const createAppearanceSystem = (): AppearanceSystem => {
    let currentState: CharacterState | null = null
    let currentModel: CharacterModel | null = null
    /* 动画键：state + attacking 时的技能 id + weaponHeld 变体，链段切换也触发姿态混合 */
    let currentAnimKey: string | null = null
    /* 水平速度 EMA 平滑（仅旧 attacking 路径使用，clip 状态不再注入） */
    let smoothedSpeed = 0
    /* 累计水平位移（平滑速度积分）：单调递增，供位移驱动动画使用（相位永不回退） */
    let travel = 0
    /* 状态切换瞬间的关节快照：新状态动画输出向快照混合，消除关节角突跳 */
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0
    /* clip 播放器（基础状态）/ 桥接骨架（以场景为真源） */
    let bridge: SkeletonSceneBridge | undefined
    let player: ReturnType<typeof createBoneAnimationPlayer> | undefined

    const teardownClip = (): void => {
        player?.pause()
        player = undefined
        bridge = undefined
    }

    const setupClip = (state: ClipState, model: CharacterModel, weaponHeld: boolean): void => {
        teardownClip()
        bridge = createCharacterSkeletonBridge(model)
        player = createBoneAnimationPlayer(bridge, getBaseClip(state, weaponHeld))
    }

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CharacterModel, weaponHeld: boolean): void => {
        /* 在旧状态 exit 归零之前抓取当前关节姿态，作为混合起点 */
        if (from !== null && currentModel === model) {
            blendFrom = snapshotJoints(model)
            blendT = 0
            if (!isClipState(from)) {
                attackingAnim.exit(model, placeholderCtx())
            }
        } else {
            blendFrom = null
        }
        currentState = to
        currentModel = model
        if (isClipState(to)) {
            setupClip(to, model, weaponHeld)
            player?.seek(0)
        } else {
            teardownClip()
            attackingAnim.enter(model, placeholderCtx())
        }
    }

    const update = (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext): void => {
        /* 动画键：attacking 状态下附加技能 id；weaponHeld 区分持械变体 */
        const weaponSuffix = ctx.weaponHeld ? ':w' : ':n'
        const animKey = state === 'attacking' && ctx.attackSkillId !== undefined
            ? `${state}:${ctx.attackSkillId}${weaponSuffix}`
            : `${state}${weaponSuffix}`
        if (animKey !== currentAnimKey || model !== currentModel) {
            onStateChange(currentState, state, model, ctx.weaponHeld)
            currentAnimKey = animKey
            /* 动画键切换时对齐新状态初值，避免旧状态速度平滑残留 */
            smoothedSpeed = ctx.horizontalSpeed
            travel = 0
        }

        if (isClipState(state) && player !== undefined) {
            /* clip 路径：播放器推进 → applyPose 写骨架 → 桥接写回 Group（场景图级联） */
            player.updater(dt)
        } else {
            /* 旧 attacking 路径（M4b 迁移后移除） */
            smoothedSpeed += (ctx.horizontalSpeed - smoothedSpeed) * HORIZONTAL_SPEED_SMOOTHING
            travel += smoothedSpeed * dt
            attackingAnim.update(dt, model, {...ctx, horizontalSpeed: smoothedSpeed, horizontalTravel: travel})
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

const placeholderCtx = (): AnimationContext => ({
    stateTime: 0, horizontalSpeed: 0, horizontalTravel: 0, swingTilt: 0,
    attackSkillId: undefined, attackPhase: undefined, attackPhaseProgress: 0,
    attackTotalProgress: 0, attackPhases: undefined, attackPhaseIndex: 0, weaponHeld: false,
})

/** 旧 attacking animator（M4b 迁移后删除） */
export type {AnimationHandler}