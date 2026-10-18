import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {createComposedAnimationPlayer, type ComposedAnimationPlayer} from '../../../../skeleton/anim/composed_player.ts'
import {createCharacterSkeletonBridge} from '../../appearance/skeleton_bridge.ts'
import type {AppearanceSystem, AppearanceSystemOptions} from '../../appearance/system.ts'
import type {AnimationContext, CreatureModel} from '../../appearance/types.ts'

/**
 * 体形动画 clip 提供者（每个体形分包自带其 `pose_fns.ts` / `clips.ts` 实现）：
 * - `clipForState`：非攻击状态的基础动作 clip；
 * - `clipForSegment`：攻击段 → 攻击 clip（按段 key 取该体形的突进 / 咬击 / 爪击 / 吐息等）。
 */
export interface CreatureClipProvider {
    readonly clipForState: (state: CharacterState, ctx: AnimationContext) => BoneAnimationClip
    readonly clipForSegment: (segment: AttackSegment) => BoneAnimationClip
}

const isAttackState = (state: CharacterState): boolean => state === 'attacking' || state === 'air_attacking'

/**
 * 体形专属动画系统（狼 / 马 / wyvern 共用此通用运行时，各自注入 clip 提供者）：
 * 状态 / 段 / 模型变化时切换到对应 clip 播放；攻击态首帧关闭旧命中窗口（由 clip 事件轨重开）。
 */
export const createCreatureAnimationSystem = (
    provider: CreatureClipProvider,
): ((options?: AppearanceSystemOptions) => AppearanceSystem) =>
    (options?: AppearanceSystemOptions): AppearanceSystem => {
        const onAttackEvent = options?.onAttackEvent
        let player: ComposedAnimationPlayer | undefined
        let currentKey: string | null = null
        let currentModel: CreatureModel | null = null

        const setup = (state: CharacterState, model: CreatureModel, ctx: AnimationContext): void => {
            player?.pause()
            const bridge = createCharacterSkeletonBridge(model)
            if (isAttackState(state)) onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
            const clip = isAttackState(state) && ctx.attackSegment !== undefined
                ? provider.clipForSegment(ctx.attackSegment)
                : provider.clipForState(state, ctx)
            player = createComposedAnimationPlayer(bridge, [{clip, weight: 1}])
            player.onEvent = record => onAttackEvent?.(record)
            player.play()
        }

        return {
            onStateChange: (): void => {},
            update: (dt, model, state, ctx): void => {
                const key = isAttackState(state)
                    ? `${state}:${ctx.attackSegment?.id ?? ''}`
                    : state
                if (key !== currentKey || model !== currentModel) {
                    currentKey = key
                    currentModel = model
                    setup(state, model, ctx)
                }
                player?.updater(dt)
            },
        }
    }
