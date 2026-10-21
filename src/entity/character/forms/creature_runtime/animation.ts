import type {Group} from 'three'
import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {createComposedAnimationPlayer, type ComposedAnimationPlayer} from '../../../../skeleton/anim/composed_player.ts'
import {STATE_BLEND_DURATION, walkSpeedScale} from '../../appearance/constants.ts'
import {segmentPhaseRatios} from './timing.ts'
import {createCharacterSkeletonBridge} from '../../appearance/skeleton_bridge.ts'
import type {AppearanceSystem, AppearanceSystemOptions} from '../../appearance/system.ts'
import type {AnimationContext, CreatureModel} from '../../appearance/types.ts'

/**
 * 体形动画 clip 提供者（每个体形分包自带其 `pose_fns.ts` / `clips.ts` 实现）：
 * - `clipForState`：非攻击状态的基础动作 clip；
 * - `clipForSegment`：攻击段 → 攻击 clip（按段 id 取该体形的爪击 / 咬击 / 蹄击 / 吐息等）。
 */
export interface CreatureClipProvider {
    readonly clipForState: (state: CharacterState, ctx: AnimationContext) => BoneAnimationClip
    readonly clipForSegment: (segment: AttackSegment) => BoneAnimationClip
}

const isAttackState = (state: CharacterState): boolean => state === 'attacking' || state === 'air_attacking'

/** 蓄力定位比例：冻结在抬手 / 瞄准末（近战 windup、远程 aim / draw 共用真实阶段分界） */
const chargeSeekScale = (segment: AttackSegment): number => segmentPhaseRatios(segment).windupEnd

/** 状态切换瞬间的关节快照（与角色外观系统同机制：新动画向旧姿态收敛，消除突跳） */
interface JointSnapshot {
    readonly joint: Group
    readonly rx: number
    readonly ry: number
    readonly rz: number
    readonly px: number
    readonly py: number
    readonly pz: number
}

const snapshotJoints = (model: CreatureModel): readonly JointSnapshot[] =>
    [...model.jointGroups.values()].map(joint => ({
        joint,
        rx: joint.rotation.x,
        ry: joint.rotation.y,
        rz: joint.rotation.z,
        px: joint.position.x,
        py: joint.position.y,
        pz: joint.position.z,
    }))

/**
 * 体形专属动画系统（狼 / 马 / 双足飞龙共用此通用运行时，各自注入 clip 提供者）：
 * 状态 / 段 / 模型变化时切换到对应 clip 播放；攻击态首帧关闭旧命中窗口（由 clip 事件轨重开）。
 * 蓄力按住时冻结在抬手末并按蓄力值定位，解决生物重击玩法时间冻结、视觉继续播放的脱节。
 */
export const createCreatureAnimationSystem = (
    provider: CreatureClipProvider,
): ((options?: AppearanceSystemOptions) => AppearanceSystem) =>
    (options?: AppearanceSystemOptions): AppearanceSystem => {
        const onAttackEvent = options?.onAttackEvent
        let player: ComposedAnimationPlayer | undefined
        let currentKey: string | null = null
        let currentModel: CreatureModel | null = null
        let charging = false
        let chargingScale = 1
        let blendFrom: readonly JointSnapshot[] | null = null
        let blendT = 0

        /** 状态 / 段切换过渡：按三次 ease-out 把新动画输出拉向切换前快照 */
        const applyBlend = (dt: number): void => {
            if (blendFrom === null) return
            blendT += dt
            const k = 1 - Math.pow(1 - Math.min(blendT / STATE_BLEND_DURATION, 1), 3)
            for (const snap of blendFrom) {
                const joint = snap.joint
                joint.rotation.x = snap.rx + (joint.rotation.x - snap.rx) * k
                joint.rotation.y = snap.ry + (joint.rotation.y - snap.ry) * k
                joint.rotation.z = snap.rz + (joint.rotation.z - snap.rz) * k
                joint.position.x = snap.px + (joint.position.x - snap.px) * k
                joint.position.y = snap.py + (joint.position.y - snap.py) * k
                joint.position.z = snap.pz + (joint.position.z - snap.pz) * k
            }
            if (blendT >= STATE_BLEND_DURATION) blendFrom = null
        }

        const setup = (state: CharacterState, model: CreatureModel, ctx: AnimationContext): void => {
            player?.pause()
            const bridge = createCharacterSkeletonBridge(model)
            if (isAttackState(state)) onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
            const segment = ctx.attackSegment
            const clip = isAttackState(state) && segment !== undefined
                ? provider.clipForSegment(segment)
                : provider.clipForState(state, ctx)
            charging = isAttackState(state) && ctx.attackHolding && segment !== undefined
            chargingScale = charging && segment !== undefined ? chargeSeekScale(segment) : 1
            player = createComposedAnimationPlayer(bridge, [{clip, weight: 1}])
            player.onEvent = record => onAttackEvent?.(record)
            player.play()
            if (isAttackState(state) && segment !== undefined) {
                player.seekProgress(ctx.attackTotalProgress)
            }
            model.updateDeform?.()
        }

        return {
            onStateChange: (): void => {},
            update: (dt, model, state, ctx): void => {
                const key = isAttackState(state)
                    ? `${state}:${ctx.attackSegment?.id ?? ''}`
                    : state
                if (key !== currentKey || model !== currentModel) {
                    /* 只有同一模型内的状态 / 段切换才做姿态混合；换模型（重建骨架）没有可比快照 */
                    blendFrom = currentModel === model && player !== undefined ? snapshotJoints(model) : null
                    blendT = 0
                    currentKey = key
                    currentModel = model
                    setup(state, model, ctx)
                }
                if (player === undefined) return
                if (isAttackState(state) && ctx.attackHolding && ctx.attackSegment !== undefined) {
                    if (!charging) {
                        charging = true
                        chargingScale = chargeSeekScale(ctx.attackSegment)
                    }
                    player.seekProgress(ctx.attackCharge * chargingScale)
                    applyBlend(dt)
                    model.updateDeform?.()
                    return
                }
                charging = false
                if (ctx.stateDuration !== undefined && (state === 'knockdown' || state === 'getting_up')) {
                    player.seekProgress(ctx.stateTime / Math.max(ctx.stateDuration, 0.0001))
                    applyBlend(dt)
                    model.updateDeform?.()
                    return
                }
                player.updater(dt)
                /* 行走 / 游泳：步频随水平速度同步，避免移动越快脚底打滑越明显 */
                if (state === 'walking' || state === 'swimming') {
                    player.setSpeed(walkSpeedScale(ctx.horizontalSpeed))
                }
                applyBlend(dt)
                model.updateDeform?.()
            },
        }
    }
