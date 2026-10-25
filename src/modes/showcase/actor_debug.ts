import type {Scene} from 'three'
import type {CreatureModel} from '../../entity/character/appearance/types.ts'
import type {HurtBlockProfile, WorldHurtBlock} from '../../character/hurt_blocks.ts'
import {worldizeHurtBlock} from '../../character/hurt_blocks.ts'
import type {CharacterDebugView as CharacterDebugViewKind} from '../../character/debug_views.ts'
import {createCharacterDebugView, type CharacterDebugView} from '../../entity/character/render/debug_view.ts'

/** 展示角色可切换的调试箱种类：物理碰撞箱 / 受击箱 / 攻击箱 */
export const SHOWCASE_DEBUG_KINDS = ['collision', 'hurt', 'attack'] as const satisfies readonly CharacterDebugViewKind[]
export type ShowcaseDebugKind = typeof SHOWCASE_DEBUG_KINDS[number]

/** 展示角色的调试可视化（默认全隐；每种可独立开关） */
export interface ActorDebug {
    readonly setVisible: (kind: ShowcaseDebugKind, on: boolean) => void
    /** 攻击箱命中窗口是否生效：生效 = 100% 不透明；未生效 = 50% 不透明 */
    readonly setAttackActive: (active: boolean) => void
    /** 是否显示副手武器攻击箱（双手共持时副手挂背，不参与判定） */
    readonly setOffhandAttackEnabled: (enabled: boolean) => void
    /** 逐帧同步（在角色动画 / 根姿态写完之后调用） */
    readonly tick: () => void
    readonly dispose: () => void
}

/**
 * 展示角色调试驱动器：复用角色渲染层的 `CharacterDebugView`，
 * 仅负责把展示角色的受击块世界化后交给基础能力同步，避免与编辑模式各写一套线框逻辑。
 */
export const createActorDebug = (
    scene: Scene,
    model: CreatureModel,
    hurtProfile: HurtBlockProfile | undefined,
): ActorDebug => {
    const view: CharacterDebugView = createCharacterDebugView(scene, model)
    const hurtBlocks: Array<WorldHurtBlock | undefined> = []

    const setVisible = (kind: ShowcaseDebugKind, on: boolean): void => {
        view.setVisible(kind, on)
    }

    const tick = (): void => {
        if (view.isVisible('hurt') && hurtProfile !== undefined) {
            model.group.updateWorldMatrix(true, true)
            hurtBlocks.length = hurtProfile.length
            for (let i = 0; i < hurtProfile.length; i++) {
                const def = hurtProfile[i]
                const joint = model.jointGroups.get(def.jointId)
                if (joint === undefined) {
                    hurtBlocks[i] = undefined
                    continue
                }
                joint.updateWorldMatrix(true, false)
                hurtBlocks[i] = worldizeHurtBlock(def, joint.matrixWorld.elements)
            }
            view.syncHurt(hurtBlocks)
        }
        if (view.isVisible('attack')) {
            view.syncAttack({ranged: false, offhandEnabled: true, projectileRadius: 0})
        }
    }

    return {
        setVisible,
        setAttackActive: view.setAttackActive,
        setOffhandAttackEnabled: view.setOffhandAttackEnabled,
        tick,
        dispose: view.dispose,
    }
}
