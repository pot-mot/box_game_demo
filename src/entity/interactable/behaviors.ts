import type {Object3D} from 'three'
import type {InteractableConfig, InteractableEntity, InteractableRuntimeContext} from './types.ts'
import type {BreakableSource} from './kinds.ts'
import {DOOR_OPEN_SPEED, GATE_DEFAULT_SPEED, ROLL_BREAK_DAMAGE, SWITCH_MOMENTARY_HOLD} from './constants.ts'

export interface InteractableBehavior {
    /** 是否可被玩家交互（默认 true） */
    readonly interactable: boolean
    /** 交互提示；返回 undefined 表示当前不可交互 */
    prompt: (e: InteractableEntity) => string | undefined
    interact?: (e: InteractableEntity, ctx: InteractableRuntimeContext) => void
    /** 信号（channel on/off）到达 */
    onSignal?: (e: InteractableEntity, on: boolean, ctx: InteractableRuntimeContext) => void
    /** 每帧推进（动画、载客、破坏判定） */
    update: (dt: number, e: InteractableEntity, ctx: InteractableRuntimeContext) => void
    /** 受到攻击（仅 breakable 生效）；返回是否消费本次命中 */
    onAttacked?: (
        e: InteractableEntity,
        source: BreakableSource,
        damageType: string,
        amount: number,
        ctx: InteractableRuntimeContext,
    ) => boolean
}

const approach = (current: number, target: number, step: number): number => {
    if (current < target) return Math.min(current + step, target)
    if (current > target) return Math.max(current - step, target)
    return current
}

const animNode = (e: InteractableEntity, name: string): Object3D | undefined => e.group.getObjectByName(name)

/* ── 存档点 ── */
const savePointBehavior: InteractableBehavior = {
    interactable: true,
    prompt: (e) => e.config.kind === 'save_point' && e.on ? '篝火（已点燃）' : '点燃篝火',
    interact: (e, ctx) => {
        e.on = true
        ctx.hooks.onSavePoint?.(e)
    },
    update: (dt, e) => {
        /* 已点燃的篝火缓慢旋转 / 呼吸 */
        const flame = animNode(e, 'flame')
        if (flame !== undefined) {
            flame.rotation.y += dt * 1.2
            flame.scale.setScalar(e.on ? 1 : 0)
        }
        const glow = animNode(e, 'glow')
        if (glow !== undefined) glow.scale.setScalar(e.on ? 1 : 0)
    },
}

/* ── 传送点 ── */
const teleportBehavior: InteractableBehavior = {
    interactable: true,
    prompt: () => '传送',
    interact: (e, ctx) => {
        e.on = true
        ctx.hooks.onTeleport?.(e)
    },
    update: (_dt, e) => {
        const ring = animNode(e, 'ring')
        if (ring !== undefined) ring.visible = e.on
    },
}

/* ── 开关 ── */
const switchBehavior: InteractableBehavior = {
    interactable: true,
    prompt: (e) => e.on ? '关闭' : '开启',
    interact: (e, ctx) => {
        if (e.config.kind !== 'switch') return
        e.on = !e.on
        if (e.on && e.config.mode === 'momentary') e.momentaryTimer = SWITCH_MOMENTARY_HOLD
        if (e.config.channel !== '') ctx.setSignal(e.config.channel, e.on)
    },
    update: (dt, e, ctx) => {
        if (e.config.kind !== 'switch' || e.config.mode !== 'momentary' || e.momentaryTimer <= 0) {
            const lever = animNode(e, 'lever')
            if (lever !== undefined) lever.rotation.x = -Math.PI / 4 * (e.on ? 1 : 0)
            return
        }
        e.momentaryTimer -= dt
        const lever = animNode(e, 'lever')
        if (lever !== undefined) lever.rotation.x = -Math.PI / 4
        if (e.momentaryTimer <= 0) {
            e.on = false
            if (e.config.kind === 'switch' && e.config.channel !== '') ctx.setSignal(e.config.channel, false)
        }
    },
}

/** 门 / 闸门 / 升降梯共用：按目标进度推进，并同步视觉与运动学碰撞体 */
const moveTowardTarget = (
    dt: number,
    e: InteractableEntity,
    speed: number,
    applyVisual: (progress: number) => void,
    applyBody?: (progress: number) => void,
): void => {
    e.progress = approach(e.progress, e.target, speed * dt)
    applyVisual(e.progress)
    applyBody?.(e.progress)
}

const setCollidersEnabled = (e: InteractableEntity, enabled: boolean): void => {
    for (const collider of e.colliders) collider.setEnabled(enabled)
}

/* ── 推门 ── */
const pushDoorBehavior: InteractableBehavior = {
    interactable: true,
    prompt: (e) => e.progress > 0.5 ? '关门' : '开门',
    interact: (e) => {
        e.target = e.target > 0.5 ? 0 : 1
    },
    onSignal: (e, on) => {
        e.target = on ? 1 : 0
    },
    update: (dt, e) => {
        moveTowardTarget(dt, e, DOOR_OPEN_SPEED, (p) => {
            if (e.config.kind === 'push_door_single') {
                const door = animNode(e, 'door')
                if (door !== undefined) door.rotation.y = -p * Math.PI / 2
            } else {
                const left = animNode(e, 'doorLeft')
                const right = animNode(e, 'doorRight')
                if (left !== undefined) left.rotation.y = -p * Math.PI / 2
                if (right !== undefined) right.rotation.y = p * Math.PI / 2
            }
        })
        /* 完全打开后禁用碰撞体，避免挡住通路 */
        setCollidersEnabled(e, e.progress < 0.98)
    },
}

/* ── 升降闸门 ── */
const gateBehavior: InteractableBehavior = {
    interactable: true,
    prompt: (e) => e.progress > 0.5 ? '关闭闸门' : '开启闸门',
    interact: (e) => {
        e.target = e.target > 0.5 ? 0 : 1
    },
    onSignal: (e, on) => {
        e.target = on ? 1 : 0
    },
    update: (dt, e) => {
        if (e.config.kind !== 'gate') return
        const travel = e.config.travel
        const speed = e.config.speed > 0 ? e.config.speed : GATE_DEFAULT_SPEED
        moveTowardTarget(dt, e, speed / Math.max(travel, 0.001), (p) => {
            const node = animNode(e, 'gate')
            if (node !== undefined) node.position.y = p * travel
        }, (p) => {
            e.body.setNextKinematicTranslation({x: e.base.x, y: e.base.y + p * travel, z: e.base.z})
        })
        /* 上升（开启）后不挡路；下落过程与关闭时挡路 */
        setCollidersEnabled(e, e.progress < 0.9)
    },
}

/* ── 箱子 ── */
const chestBehavior: InteractableBehavior = {
    interactable: true,
    prompt: () => '打开箱子',
    interact: (e, ctx) => {
        ctx.hooks.onOpenChest?.(e)
    },
    update: (dt, e) => {
        const lid = animNode(e, 'lid')
        if (lid !== undefined) {
            e.progress = approach(e.progress, e.target, dt * DOOR_OPEN_SPEED)
            lid.rotation.x = -e.progress * Math.PI / 3
        }
    },
}

/* ── 升降梯 ── */
const elevatorBehavior: InteractableBehavior = {
    interactable: true,
    prompt: (e) => e.progress > 0.5 ? '下降' : '上升',
    interact: (e) => {
        e.target = e.target > 0.5 ? 0 : 1
    },
    onSignal: (e, on) => {
        e.target = on ? 1 : 0
    },
    update: (dt, e, ctx) => {
        if (e.config.kind !== 'elevator') return
        const travel = e.config.travel
        const speed = e.config.speed > 0 ? e.config.speed : 1
        const prev = e.progress
        moveTowardTarget(dt, e, speed / Math.max(travel, 0.001), (p) => {
            const platform = animNode(e, 'platform')
            if (platform !== undefined) platform.position.y = p * travel
        }, (p) => {
            e.body.setNextKinematicTranslation({x: e.base.x, y: e.base.y + p * travel, z: e.base.z})
        })
        /* 载客：站在平台上时按行程位移平移玩家 */
        const delta = e.progress - prev
        if (delta !== 0 && ctx.player !== undefined && ctx.player.isGrounded()) {
            const pos = ctx.player.readPosition()
            if (pos !== undefined && insidePlatform(e, pos.x, pos.y, pos.z)) {
                ctx.player.translate(0, delta * travel, 0)
            }
        }
    },
}

const insidePlatform = (e: InteractableEntity, x: number, y: number, z: number): boolean => {
    if (e.config.kind !== 'elevator') return false
    const halfX = e.config.size[0] / 2
    const halfZ = e.config.size[2] / 2
    const platformY = e.base.y + e.progress * e.config.travel
    return Math.abs(x - e.base.x) <= halfX
        && Math.abs(z - e.base.z) <= halfZ
        && y >= platformY - 0.05
        && y <= platformY + 0.6
}

/* ── 可破坏道具 ── */
const breakableBehavior: InteractableBehavior = {
    interactable: false,
    prompt: () => undefined,
    update: (_dt, e) => {
        /* 受击闪烁衰减：group.scale 略缩 */
        const k = Math.max(e.health / Math.max((e.config.kind === 'breakable' ? e.config.health : 1), 1), 0)
        e.group.scale.setScalar(0.9 + 0.1 * k)
    },
    onAttacked: (e, source, _damageType, amount, ctx) => {
        if (e.config.kind !== 'breakable' || e.dead) return false
        if (!e.config.breakableBy.includes(source)) return false
        e.health -= amount
        if (e.health <= 0) {
            e.health = 0
            e.dead = true
            ctx.hooks.onBreak?.(e)
            ctx.despawn(e.id)
        }
        return true
    },
}

/* ── 翻滚破坏：由 world 侧在玩家翻滚无敌窗口内投递 ── */
export const rollBreakDamage = (): number => ROLL_BREAK_DAMAGE

export const BEHAVIORS: Record<InteractableConfig['kind'], InteractableBehavior> = {
    save_point: savePointBehavior,
    teleport: teleportBehavior,
    switch: switchBehavior,
    push_door_single: pushDoorBehavior,
    push_door_double: pushDoorBehavior,
    gate: gateBehavior,
    chest: chestBehavior,
    elevator: elevatorBehavior,
    breakable: breakableBehavior,
}
