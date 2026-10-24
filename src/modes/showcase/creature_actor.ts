import {Box3, Group, Mesh, Sprite} from 'three'
import type {Material, Scene} from 'three'
import {bodyFormOf} from '../../entity/character/body_form/index.ts'
import type {AnimationContext, CreatureModel} from '../../entity/character/appearance/types.ts'
import type {AppearanceSystem} from '../../entity/character/appearance/types.ts'
import {createActorDebug} from './actor_debug.ts'
import {ACTOR_JUMP_HEIGHT, ACTOR_SCALE, ACTOR_SPEED, DIMMED_OPACITY, RACE_SHOWCASE_HOLD_SECONDS} from './constants.ts'
import type {NameLabel} from './label.ts'
import type {ShowcaseActorHandle} from './actor_handle.ts'

/** 体形展示角色：在通用展示角色接口上暴露当前姿态（idle / walking）与标签高度 */
export interface CreatureShowcaseActor extends ShowcaseActorHandle {
    readonly state: 'idle' | 'walking'
    /** 头顶标签高度（按模型实际高度计算的锚点上方高度，供创建标签时传入） */
    readonly labelHeight: number
}

export interface CreatureActorInit {
    readonly id: number
    readonly scene: Scene
    readonly x: number
    readonly z: number
    /** 展示名（面板 / 头顶标签） */
    readonly name: string
    /** 副名（面板显示） */
    readonly subtitle: string
    /** 体形 id（`BodyForm.id`，如 wolf / horse / wyvern） */
    readonly bodyFormId: string
}

/** 变暗前的材质状态快照（恢复时精确还原） */
interface MaterialSnapshot {
    readonly material: Material
    readonly opacity: number
    readonly transparent: boolean
}

/**
 * 体形（非人形）展示驱动器：狼 / 马 / 双足飞龙等 `BodyForm` 的外观 + 动画展示。
 *
 * 时间线：站立 2s ↔ 行走 2s 交替循环（`RACE_SHOWCASE_HOLD_SECONDS`），
 * 行走时注入 `horizontalSpeed = ACTOR_SPEED` 使步频正常、位置原地不动（纯动画展示）。
 * 动画由体形计划自带的 `createAnimation()` 提供（狼 / 马 / wyvern 各自的 `clips` / `pose_fns`），
 * 上下文注入镜像生产 `world.ts`，状态在 `idle` / `walking` 间切换触发快照混合。
 */
export const createCreatureActor = (init: CreatureActorInit): CreatureShowcaseActor => {
    const {id, scene, x, z, name, subtitle, bodyFormId} = init

    const form = bodyFormOf(bodyFormId)
    /* 体形固定调色板与阵营无关；faction 仅人形使用，传 0 */
    const model: CreatureModel = form.createModel(
        {speed: ACTOR_SPEED, jumpHeight: ACTOR_JUMP_HEIGHT, scale: ACTOR_SCALE},
        0,
    )
    const system: AppearanceSystem = form.animation.createSystem({})

    const anchor = new Group()
    anchor.position.set(x, 0, z)
    anchor.add(model.group)
    scene.add(anchor)

    /* 标签高度按模型实际高度计算（各体形差异大：狼矮 / 马龙高），避免标签压进身体 */
    model.group.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model.group)
    const labelHeight = bounds.max.y + 0.35

    /* 调试箱（物理碰撞箱 / 受击箱 / 攻击箱）：默认全隐 */
    const debug = createActorDebug(scene, model, form.skeleton.hurtProfile)

    /* —— 站立 / 行走交替时间线 —— */
    let currentState: 'idle' | 'walking' = 'idle'
    let stateTime = 0

    const applyAnimation = (dt: number): void => {
        const ctx: AnimationContext = {
            stateTime,
            horizontalSpeed: currentState === 'walking' ? ACTOR_SPEED : 0,
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

    /* —— 头顶名称标签 —— */
    let labelDispose: (() => void) | null = null
    const attachLabel = (label: NameLabel): void => {
        anchor.add(label.sprite)
        labelDispose = label.dispose
    }

    /* —— 聚焦变暗 —— */
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
        id, anchor, weaponName: name, holdModeLabel: subtitle, factionColor: 0,
        update, attachLabel, setDimmed, dispose,
        setDebugVisible: (kind, on) => debug.setVisible(kind, on),
        debugTick: () => debug.tick(),
        get state() { return currentState },
        labelHeight,
    }
}
