import {Group, Mesh, Sprite} from 'three'
import type {Material, Scene} from 'three'
import {createHumanoidModel} from '../../entity/character/body_form/humanoid/body_form.ts'
import {HUMANOID_BASE} from '../../entity/character/body_form/humanoid/state/form_base.ts'
import {HUMANOID_ANIMATION} from '../../entity/character/body_form/humanoid/skeleton_animation/system.ts'
import type {AppearanceSystem} from '../../entity/character/appearance/types.ts'
import type {AnimationContext} from '../../entity/character/appearance/types.ts'
import type {CharacterModel} from '../../entity/character/body_form/humanoid/appearance/types.ts'
import {HUMANOID_HURT_BLOCKS} from '../../entity/character/body_form/humanoid/skeleton/hurt.ts'
import {createActorDebug} from './actor_debug.ts'
import {DEFAULT_HANDEDNESS} from '../../character/handedness.ts'
import {resolveLimbLoadout, resolveArmorLoadout} from '../../character/armor/catalog.ts'
import type {LimbLoadout, ArmorLoadout} from '../../character/armor/types.ts'
import {ACTOR_JUMP_HEIGHT, ACTOR_SCALE, ACTOR_SPEED, DIMMED_OPACITY} from './constants.ts'
import type {NameLabel} from './label.ts'
import type {ShowcaseActorHandle, ShowcaseAction} from './actor_handle.ts'
import {applyShowcaseRootPosture} from './root_posture.ts'

/** 种族 / 套装展示角色：在通用展示角色接口上暴露当前动作，便于面板 / 测试校验 */
export interface RaceShowcaseActor extends ShowcaseActorHandle {
    readonly state: ShowcaseAction
    readonly setAction: (action: ShowcaseAction) => void
}

export interface RaceActorInit {
    readonly id: number
    readonly scene: Scene
    readonly x: number
    readonly z: number
    /** 展示名（面板 / 头顶标签） */
    readonly name: string
    /** 副名（面板显示；种族展示可为空） */
    readonly subtitle: string
    readonly faction: number
    /** 肢体装备表（种族展示：四槽同族；套装展示：缺省 = 人类肢体） */
    readonly limb: LimbLoadout
    /** 护甲装备表（套装展示；种族展示：缺省 = 不穿护甲） */
    readonly armor: ArmorLoadout
}

/** 变暗前的材质状态快照（恢复时精确还原） */
interface MaterialSnapshot {
    readonly material: Material
    readonly opacity: number
    readonly transparent: boolean
}

/**
 * 种族 / 套装展示驱动器：与武器展示驱动器（`actor.ts`）并列的第二种展示角色。
 *
 * 动作由左侧面板经 `setAction()` 切换（不再定时轮换）：默认待机，可切到全部非攻击基础状态。
 * 行走 / 游泳注入 `horizontalSpeed = ACTOR_SPEED` 使步频正常、位置原地不动（纯动画展示）；
 * 游泳额外镜像生产 `world.ts` 的俯卧根姿态。动画上下文同义注入
 * `HUMANOID_ANIMATION.createSystem()`，动作切换触发快照混合，衔接平滑。
 *
 * 外观：`createCharacterModel` + `equipLimbs` / `equipArmor`；空肢体 = 默认人类肢体，
 * 肢体的披挂 / 发色随 `faction` 对应的阵营调色板着色（`createCharacterModel` 已按 faction 取色）。
 */
export const createRaceActor = (init: RaceActorInit): RaceShowcaseActor => {
    const {id, scene, x, z, name, subtitle, faction} = init

    const model: CharacterModel = createHumanoidModel(
        {speed: ACTOR_SPEED, jumpHeight: ACTOR_JUMP_HEIGHT, scale: ACTOR_SCALE},
        faction,
    )
    /* 装备：肢体默认 replace（空 = 人类肢体），护甲叠加；换阵营时肢体颜色随调色板重建 */
    model.equipLimbs(resolveLimbLoadout(init.limb))
    model.equipArmor(resolveArmorLoadout(init.armor))

    const anchor = new Group()
    anchor.position.set(x, 0, z)
    anchor.add(model.group)
    scene.add(anchor)

    /* 调试箱（物理碰撞箱 / 受击箱 / 攻击箱）：默认全隐，由面板开关控制 */
    const debug = createActorDebug(scene, model, HUMANOID_HURT_BLOCKS)

    const system: AppearanceSystem = HUMANOID_ANIMATION.createSystem()

    /* —— 当前动作（由左侧面板切换） —— */
    let currentState: ShowcaseAction = 'idle'
    let stateTime = 0
    const centerOffsetY = HUMANOID_BASE.centerOffsetY * ACTOR_SCALE

    /** 注入动画上下文（镜像 world.ts 装配）：空手动作，速度用于步频 / 下落收腿 */
    const applyAnimation = (dt: number): void => {
        const ctx: AnimationContext = {
            stateTime,
            horizontalSpeed: currentState === 'walking' || currentState === 'sprinting' || currentState === 'swimming' ? ACTOR_SPEED : 0,
            verticalSpeed: currentState === 'falling' ? -8 : 0,
            /* 空手：持握模式对基础姿态无影响（无武器），取单持 */
            humanoid: {holdMode: 'one_handed', handedness: DEFAULT_HANDEDNESS, shieldHands: {main: false, off: false}},
            attackSegment: undefined,
            attackPhase: undefined,
            attackPhaseProgress: 0,
            attackTotalProgress: 0,
            attackPhaseIndex: 0,
            attackCharge: 0,
            attackHolding: false,
            weaponHeld: false,
        }
        system.update(dt, model, currentState, ctx)
        applyShowcaseRootPosture(model.group, currentState, centerOffsetY, true)
    }

    const update = (dt: number): void => {
        stateTime += dt
        applyAnimation(dt)
    }

    const setAction = (action: ShowcaseAction): void => {
        if (action === currentState) return
        currentState = action
        stateTime = 0
        applyAnimation(0)
    }

    /* —— 头顶名称标签：sprite 挂锚点、dispose 句柄留存，随 dispose 统一回收 —— */
    let labelDispose: (() => void) | null = null
    const attachLabel = (label: NameLabel): void => {
        anchor.add(label.sprite)
        labelDispose = label.dispose
    }

    /* —— 聚焦变暗：遍历锚点下全部 Mesh/Sprite 材质改透明度，恢复时按快照还原 —— */
    let dimmed = false
    const saved: MaterialSnapshot[] = []
    const setDimmed = (on: boolean): void => {
        if (on === dimmed) return
        dimmed = on
        if (on) {
            anchor.traverse(obj => {
                if (!(obj instanceof Mesh || obj instanceof Sprite)) return
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
                for (const m of mats) {
                    saved.push({material: m, opacity: m.opacity, transparent: m.transparent})
                    m.transparent = true
                    m.opacity = DIMMED_OPACITY
                }
            })
        } else {
            for (const snap of saved) {
                snap.material.opacity = snap.opacity
                snap.material.transparent = snap.transparent
            }
            saved.length = 0
        }
    }

    const dispose = (): void => {
        setDimmed(false)
        debug.dispose()
        labelDispose?.()
        model.dispose()
        scene.remove(anchor)
    }

    return {
        id, anchor, weaponName: name, attackModuleLabel: subtitle, factionColor: faction,
        update, setAction, attachLabel, setDimmed, dispose,
        setDebugVisible: (kind, on) => debug.setVisible(kind, on),
        debugTick: () => debug.tick(),
        get state() { return currentState },
    }
}
