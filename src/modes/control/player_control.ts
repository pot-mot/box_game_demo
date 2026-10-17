import {Vector3, type PerspectiveCamera} from 'three'
import {getInputRegistry} from '../../input/registry.ts'
import type {InputAction} from '../../input/types.ts'
import {ORBIT_SENSITIVITY} from '../constants.ts'
import {applyFreeFlightMovement} from './free_flight.ts'
import {
    CAMERA_ORBIT_FOCUS_DISTANCE,
    CAMERA_ORBIT_FOCUS_LERP,
    LOCK_ON_BLEND_FACTOR,
    LOCK_ON_TURN_FACTOR,
    PLAYER_CAMERA_DEFAULT_DISTANCE,
    PLAYER_CAMERA_DEFAULT_PITCH,
    PLAYER_CAMERA_DEFAULT_YAW,
    PLAYER_CAMERA_MAX_DISTANCE,
    PLAYER_CAMERA_MIN_DISTANCE,
    PLAYER_CAMERA_SMOOTH_FACTOR,
    PLAYER_CAMERA_WHEEL_SENSITIVITY,
    PLAYER_CAMERA_ZOOM_SMOOTH_FACTOR,
    PLAYER_CLICK_DRAG_THRESHOLD,
} from './constants.ts'
import type {FocusController} from './camera_control.ts'

/** 鼠标攻击回调：轻击（左键）/ 重击（右键）均携带按住时长供蓄力守卫区分点按 / 长按 */
export interface MouseAttackCallbacks {
    /** 左键按下：可蓄力攻击（远程弓/投掷、近战重击）进入蓄力（按住期间冻结并累积力度） */
    onLightAttackStart?: () => void
    /** 轻击（左键松开且未拖拽），参数 = 按住时长（秒） */
    onLightAttack: (holdSeconds: number) => void
    /** 左键按下后拖拽旋转视角（或失焦）：取消蓄力，不触发攻击 */
    onLightAttackCancel?: () => void
    /** 右键按下：可蓄力的重击（近战重击）进入蓄力 */
    onHeavyAttackStart?: () => void
    /** 重击（右键松开），参数 = 按住时长（秒） */
    onHeavyAttack: (holdSeconds: number) => void
    /** 右键蓄力被取消（失焦等）：不触发攻击 */
    onHeavyAttackCancel?: () => void
}

/** 镜头锁定回调：中键切换目标、逐帧提供瞄准点、手动旋转视角时解除 */
export interface CameraLockTarget {
    readonly onToggle: () => void
    readonly getAimPoint: () => Vector3 | undefined
    readonly onOrbit: () => void
}

export interface PlayerControlOptions {
    /** 相机跟随目标（玩家身体中心等）；返回 undefined 时退化为自由飞行 */
    readonly getTarget: () => Vector3 | undefined
    /** 移动输出：dx/dz 为相机水平基准方向上的合成输入，roll 为本次翻滚边沿，swimLift 为游泳竖直意图（-1..1） */
    readonly move: (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, roll: boolean, swimLift: number) => void
    /** 持握模式切换（默认 Ctrl）回调；缺省不处理 */
    readonly cycleHoldMode?: () => void
    /** 攻击回调（含蓄力）；缺省 = 无战斗 */
    readonly combat?: MouseAttackCallbacks
    /** 镜头锁定回调；缺省 = 无锁定 */
    readonly lock?: CameraLockTarget
    /** 可重绑的指针动作集合（让位给「修饰键+鼠标」绑定动作） */
    readonly pointerActions: readonly InputAction[]
    readonly initialYaw?: number
    readonly initialPitch?: number
    readonly initialDistance?: number
    /** 释放所有窗口级监听（缺省不释放，随模式生命周期存续） */
    readonly signal?: AbortSignal
}

/**
 * 玩家主控控制器：统一「相对相机的移动 + 翻滚 + 跳跃 + 第三人称环绕相机」。
 * 相机围绕玩家平滑跟随、左键拖拽旋转、滚轮缩放；可选攻击 / 锁定 / 聚焦。**不提供右键平移**。
 *
 * - `move()`：读取 WASD / 跳跃 / 翻滚（`roll` 动作）/ 持握切换并写入角色，应在角色状态机更新前调用；
 * - `update(dt)`：相机跟随 / 环绕 / 锁定 / 聚焦，应在角色同步后调用。
 */
export interface PlayerControl extends FocusController {
    /** 返回当前偏航角（供外部计算移动 / 朝向基准） */
    readonly getYaw: () => number
    /** 读取移动输入并写入角色（每帧、角色状态机更新前调用） */
    move: () => void
    /** 更新相机（每帧、角色同步后调用） */
    update: (dt: number) => void
}

export const createPlayerControl = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    options: PlayerControlOptions,
): PlayerControl => {
    const input = getInputRegistry()
    const move = options.move
    const combat = options.combat
    const lock = options.lock
    const pointerActions = options.pointerActions
    const signal = options.signal

    let yaw = options.initialYaw ?? PLAYER_CAMERA_DEFAULT_YAW
    let pitch = options.initialPitch ?? PLAYER_CAMERA_DEFAULT_PITCH
    let distance = options.initialDistance ?? PLAYER_CAMERA_DEFAULT_DISTANCE
    /** 渲染距离：逐帧平滑逼近逻辑距离（`distance`），消除滚轮跳变 */
    let renderDistance = distance

    /** 正在按住「旋转视角」绑定的鼠标按键（undefined = 未按下） */
    let orbitButton: number | undefined
    /** 旋转键按下后累计移动距离（像素），用于区分 click / drag */
    let dragDist = 0
    /** 攻击键按下时刻（performance.now()，undefined = 未按下），松开时算按住时长 */
    let leftDownAt: number | undefined
    let rightDownAt: number | undefined
    /** 触发轻击 / 重击的鼠标按键（攻击可重绑，松开时需比对同一按键） */
    let lightButton: number | undefined
    let heavyButton: number | undefined

    /** 平滑后的跟随目标（EMA），避免角色弹跳直接传导到相机 */
    const smoothedTarget = new Vector3()
    let hasSmoothedTarget = false
    /** 视点（lookAt 目标）：锁定/取消锁定时在玩家与锁定目标之间平滑混合 */
    const lookPoint = new Vector3()
    /** 最近一次有效锁定瞄准点（解除锁定后淡出期间继续使用） */
    const lastAimPoint = new Vector3()
    /** 视点混合权重（0 = 对准玩家，1 = 对准锁定目标） */
    let lockViewBlend = 0
    /** 聚焦目标（展示模式点击聚焦交互物 / 建筑等）；null = 未聚焦 */
    let focusPoint: Vector3 | null = null
    let focusDistance = CAMERA_ORBIT_FOCUS_DISTANCE
    /** 进入聚焦前的观察距离（取消聚焦后回归） */
    let savedDistance = distance
    /** 取消聚焦后是否正在回归快照距离 */
    let returning = false
    let returnDistance = distance

    const focusTo = (position: Vector3 | null, targetDistance?: number): void => {
        if (position === null) {
            if (focusPoint === null) return
            focusPoint = null
            returnDistance = savedDistance
            returning = true
            return
        }
        /* 首次进入聚焦时快照当前观察距离（连续切换聚焦目标不覆盖快照） */
        if (focusPoint === null) savedDistance = distance
        focusPoint = position.clone()
        focusDistance = targetDistance ?? CAMERA_ORBIT_FOCUS_DISTANCE
        returning = false
    }
    const isFocused = (): boolean => focusPoint !== null

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (lock !== undefined
            && input.matchesMouseButton('lock_target', e.button)
            && !input.isMouseButtonOverridden(e.button, pointerActions, 'lock_target')) {
            /* 阻止中键自动滚动 */
            e.preventDefault()
            lock.onToggle()
        }
        if (input.matchesMouseButton('mouse_orbit', e.button)
            && !input.isMouseButtonOverridden(e.button, pointerActions, 'mouse_orbit')) {
            orbitButton = e.button
            dragDist = 0
            element.focus()
        }
        if (combat !== undefined && input.matchesMouseButton('attack_light', e.button)
            && !input.isMouseButtonOverridden(e.button, pointerActions, 'attack_light')) {
            lightButton = e.button
            leftDownAt = performance.now()
            /* 轻击键按下即开始蓄力（可蓄力远程武器；非蓄力武器为空操作）。拖拽会取消。 */
            combat.onLightAttackStart?.()
        }
        if (combat !== undefined && input.matchesMouseButton('attack_heavy', e.button)
            && !input.isMouseButtonOverridden(e.button, pointerActions, 'attack_heavy')) {
            e.preventDefault()
            heavyButton = e.button
            rightDownAt = performance.now()
            /* 重击键按下即开始重击蓄力（近战重击；非蓄力武器为空操作）。失焦会取消。 */
            combat.onHeavyAttackStart?.()
        }
    }, {signal})
    element.addEventListener('contextmenu', (e: Event) => {
        /* 仅阻止浏览器右键菜单：不清空攻击键计时、不取消蓄力——
         * 部分平台 contextmenu 先于 mouseup 触发，若在此取消会中断右键重击 / 左键远程蓄力 */
        e.preventDefault()
    }, {signal})
    window.addEventListener('blur', () => {
        orbitButton = undefined
        leftDownAt = undefined
        rightDownAt = undefined
        lightButton = undefined
        heavyButton = undefined
        combat?.onLightAttackCancel?.()
        combat?.onHeavyAttackCancel?.()
    }, {signal})
    window.addEventListener('mouseup', (e: MouseEvent) => {
        /* 本次拖拽是否达到点击阈值之外的位移（拖拽视角不触攻击） */
        const dragged = e.button === orbitButton && dragDist >= PLAYER_CLICK_DRAG_THRESHOLD
        if (e.button === orbitButton) orbitButton = undefined
        if (e.button === lightButton && combat !== undefined) {
            if (!dragged && leftDownAt !== undefined) {
                combat.onLightAttack((performance.now() - leftDownAt) / 1000)
            } else {
                combat.onLightAttackCancel?.()
            }
            leftDownAt = undefined
            lightButton = undefined
        }
        if (e.button === heavyButton && combat !== undefined) {
            if (!dragged && rightDownAt !== undefined) {
                combat.onHeavyAttack((performance.now() - rightDownAt) / 1000)
            } else {
                combat.onHeavyAttackCancel?.()
            }
            rightDownAt = undefined
            heavyButton = undefined
        }
    }, {signal})
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (orbitButton === undefined) return
        const mx = e.movementX
        const my = e.movementY
        dragDist += Math.hypot(mx, my)
        /* 达到点击阈值才算真实拖拽才解除锁定（与 click/drag 判定一致），避免攻击点击时的指针抖动误解除 */
        if (dragDist >= PLAYER_CLICK_DRAG_THRESHOLD) lock?.onOrbit()
        yaw -= mx * ORBIT_SENSITIVITY
        pitch -= my * ORBIT_SENSITIVITY
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
    }, {signal})

    element.addEventListener('wheel', (e: WheelEvent) => {
        const target = options.getTarget()
        if (target) {
            e.preventDefault()
            /* 用户主动缩放取消聚焦回归动画 */
            returning = false
            /* 指数缩放（距离按比例）：缩小视角时同样平缓，避免近距时一步跨度过大 */
            distance = Math.max(
                PLAYER_CAMERA_MIN_DISTANCE,
                Math.min(PLAYER_CAMERA_MAX_DISTANCE, distance * Math.exp(e.deltaY * PLAYER_CAMERA_WHEEL_SENSITIVITY)),
            )
        }
    }, {signal})

    /* Esc 解除聚焦（与纯摄像机一致）：恢复跟随玩家 */
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && focusPoint !== null) focusTo(null)
    }, {signal})

    const readMove = (): void => {
        /* 以相机偏航角为移动基准（水平前向 = -sin/-cos，右向 = cos/-sin） */
        const fwdX = -Math.sin(yaw)
        const fwdZ = -Math.cos(yaw)
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)
        let dx = 0
        let dz = 0
        /** 前后输入（前 +1 / 后 -1）：用于把镜头俯仰分量折算为游泳上浮 / 下潜意图 */
        let fwdInput = 0
        if (input.isActionActive('move_forward')) { dx += fwdX; dz += fwdZ; fwdInput += 1 }
        if (input.isActionActive('move_backward')) { dx -= fwdX; dz -= fwdZ; fwdInput -= 1 }
        if (input.isActionActive('move_left')) { dx -= rightX; dz -= rightZ }
        if (input.isActionActive('move_right')) { dx += rightX; dz += rightZ }
        /* 镜头前向的垂直分量 = -sin(pitch)：抬头（pitch<0）为正 → 前游上浮、低头前游下潜 */
        const swimLift = fwdInput * (-Math.sin(pitch))
        move(dx, dz, input.wasActionPressed('jump'), fwdX, fwdZ, input.wasActionPressed('roll'), swimLift)

        /* 持握模式切换（默认 Ctrl）：isActionActive 走最长组合遮蔽，
         * Ctrl+S / Ctrl+O 按下时该动作被更长组合覆盖，不会误触发切换 */
        if (options.cycleHoldMode !== undefined
            && input.wasActionPressed('cycle_hold_mode') && input.isActionActive('cycle_hold_mode')) {
            options.cycleHoldMode()
        }
    }

    const update = (dt: number): void => {
        /* 「锁定目标」支持键盘改绑：鼠标绑定在 mousedown 中经 matchesMouseButton 处理，键盘走动作边沿 */
        if (input.wasActionPressed('lock_target')) lock?.onToggle()
        const target = options.getTarget()
        if (target === undefined) {
            /* 无玩家：退化为自由飞行（与纯摄像机一致） */
            camera.rotation.order = 'YXZ'
            camera.rotation.set(pitch, yaw, 0)
            applyFreeFlightMovement(camera, input)
            return
        }

        const focusK = 1 - Math.exp(-CAMERA_ORBIT_FOCUS_LERP * dt)
        if (focusPoint !== null) {
            /* 聚焦：平滑移向聚焦点并调整距离（展示模式点击聚焦） */
            if (!hasSmoothedTarget) { smoothedTarget.copy(target); hasSmoothedTarget = true }
            smoothedTarget.lerp(focusPoint, focusK)
            distance += (focusDistance - distance) * focusK
        } else {
            /* 帧率无关的 EMA 平滑：1 - exp(-k·dt) */
            const k = 1 - Math.exp(-PLAYER_CAMERA_SMOOTH_FACTOR * dt)
            if (!hasSmoothedTarget) {
                smoothedTarget.copy(target)
                hasSmoothedTarget = true
            } else {
                smoothedTarget.lerp(target, k)
            }
            /* 锁定期间：环绕角平滑转向「玩家 → 目标」方向（相机绕到目标对侧） */
            const aimPoint = lock?.getAimPoint()
            if (aimPoint) {
                lastAimPoint.copy(aimPoint)
                const desiredYaw = Math.atan2(smoothedTarget.x - aimPoint.x, smoothedTarget.z - aimPoint.z)
                yaw += wrapAngle(desiredYaw - yaw) * (1 - Math.exp(-LOCK_ON_TURN_FACTOR * dt))
            }
            lockViewBlend += (((aimPoint !== undefined) ? 1 : 0) - lockViewBlend) * (1 - Math.exp(-LOCK_ON_BLEND_FACTOR * dt))
            /* 取消聚焦后观察距离平滑回归进入聚焦前的距离 */
            if (returning) {
                distance += (returnDistance - distance) * focusK
                if (Math.abs(distance - returnDistance) < 0.01) returning = false
            }
        }

        /* 渲染距离平滑逼近逻辑距离：滚轮 / 聚焦 / 回归改变距离时避免单帧跳变 */
        renderDistance += (distance - renderDistance) * (1 - Math.exp(-PLAYER_CAMERA_ZOOM_SMOOTH_FACTOR * dt))

        camera.position.set(
            smoothedTarget.x + renderDistance * Math.sin(yaw) * Math.cos(pitch),
            smoothedTarget.y + renderDistance * Math.sin(pitch),
            smoothedTarget.z + renderDistance * Math.cos(yaw) * Math.cos(pitch),
        )
        if (focusPoint !== null) {
            lookPoint.copy(smoothedTarget)
        } else {
            /* 视点平滑过渡：锁定/解除均不跳变（解除后沿用最后瞄准点淡出回玩家） */
            lookPoint.copy(smoothedTarget).lerp(lastAimPoint, lockViewBlend)
        }
        camera.lookAt(lookPoint)
    }

    return {focusTo, isFocused, getYaw: () => yaw, move: readMove, update}
}

/** 归一化角度到 (-π, π] */
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle))
