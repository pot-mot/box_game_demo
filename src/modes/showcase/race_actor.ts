import {Group, Mesh, Sprite} from 'three'
import type {Material, Scene} from 'three'
import {createCharacterModel} from '../../entity/character/appearance/model.ts'
import {createAppearanceSystem} from '../../entity/character/appearance/system.ts'
import type {AppearanceSystem} from '../../entity/character/appearance/system.ts'
import type {AnimationContext, CharacterModel} from '../../entity/character/appearance/types.ts'
import {resolveLimbLoadout, resolveArmorLoadout} from '../../character/armor/catalog.ts'
import type {LimbLoadout, ArmorLoadout} from '../../character/armor/types.ts'
import {ACTOR_JUMP_HEIGHT, ACTOR_SCALE, ACTOR_SPEED, DIMMED_OPACITY, RACE_SHOWCASE_HOLD_SECONDS} from './constants.ts'
import type {NameLabel} from './label.ts'
import type {ShowcaseActorHandle} from './actor_handle.ts'

/** 种族 / 套装展示角色：在通用展示角色接口上暴露当前姿态（idle / walking），便于校验循环时序 */
export interface RaceShowcaseActor extends ShowcaseActorHandle {
    readonly state: 'idle' | 'walking'
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
 * 时间线：站立 2s ↔ 行走 2s 交替循环（`RACE_SHOWCASE_HOLD_SECONDS`），
 * 行走时注入 `horizontalSpeed = ACTOR_SPEED` 使步频正常、位置原地不动（纯动画展示）。
 * 动画注入镜像生产 `world.ts`：构造同名同语义 `AnimationContext` 交给 `createAppearanceSystem()`，
 * 状态在 `idle` / `walking` 间切换触发快照混合，衔接平滑。
 *
 * 外观：`createCharacterModel` + `equipLimbs` / `equipArmor`；空肢体 = 默认人类肢体，
 * 肢体的披挂 / 发色随 `faction` 对应的阵营调色板着色（`createCharacterModel` 已按 faction 取色）。
 */
export const createRaceActor = (init: RaceActorInit): RaceShowcaseActor => {
    const {id, scene, x, z, name, subtitle, faction} = init

    const model: CharacterModel = createCharacterModel(
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

    const system: AppearanceSystem = createAppearanceSystem()

    /* —— 站立 / 行走交替时间线 —— */
    let currentState: 'idle' | 'walking' = 'idle'
    let stateTime = 0

    /** 注入动画上下文（镜像 world.ts 装配）：空手站立 / 行走，速度用于步频 */
    const applyAnimation = (dt: number): void => {
        const ctx: AnimationContext = {
            stateTime,
            horizontalSpeed: currentState === 'walking' ? ACTOR_SPEED : 0,
            /* 空手：持握模式对基础姿态无影响（无武器），取单持 */
            holdMode: 'one_handed',
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
    }

    const update = (dt: number): void => {
        stateTime += dt
        if (stateTime >= RACE_SHOWCASE_HOLD_SECONDS) {
            stateTime -= RACE_SHOWCASE_HOLD_SECONDS
            currentState = currentState === 'idle' ? 'walking' : 'idle'
        }
        applyAnimation(dt)
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
        labelDispose?.()
        model.dispose()
        scene.remove(anchor)
    }

    return {
        id, anchor, weaponName: name, holdModeLabel: subtitle, factionColor: faction,
        update, attachLabel, setDimmed, dispose,
        get state() { return currentState },
    }
}
