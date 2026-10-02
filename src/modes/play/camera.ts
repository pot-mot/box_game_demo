import {Vector3, type PerspectiveCamera} from 'three'
import {ZOOM_SPEED, MIN_DISTANCE, MAX_DISTANCE, CAMERA_SMOOTH_FACTOR, LOCK_ON_TURN_FACTOR, LOCK_ON_BLEND_FACTOR} from './constants.ts'
import {ORBIT_SENSITIVITY} from '../constants.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {applyFreeFlightMovement} from '../free_flight.ts'
import {wrapAngle} from './lock_on.ts'

const CLICK_DRAG_THRESHOLD = 5

export interface MouseAttackCallbacks {
    /** 左键按下：可蓄力攻击（远程弓/投掷、近战重击）进入蓄力（按住期间冻结并累积力度） */
    onLightAttackStart?: () => void
    /** 轻击（左键松开且未拖拽），参数 = 按住时长（秒，用于蓄力守卫） */
    onLightAttack: (holdSeconds: number) => void
    /** 左键按下后拖拽旋转视角（或失焦）：取消蓄力，不触发攻击 */
    onLightAttackCancel?: () => void
    /** 右键按下：可蓄力的重击（近战重击）进入蓄力 */
    onHeavyAttackStart?: () => void
    /** 重击（右键松开），参数 = 按住时长（秒，用于蓄力守卫） */
    onHeavyAttack: (holdSeconds: number) => void
    /** 右键蓄力被取消（失焦等）：不触发攻击 */
    onHeavyAttackCancel?: () => void
}

/** 镜头锁定回调：中键切换目标、逐帧提供瞄准点、手动旋转视角时解除 */
export interface CameraLockTarget {
    /** 切换锁定目标（「锁定目标」绑定按下时调用） */
    readonly onToggle: () => void
    /** 当前锁定目标的瞄准点；未锁定或目标失效时返回 undefined */
    readonly getAimPoint: () => Vector3 | undefined
    /** 手动拖拽旋转视角时解除锁定 */
    readonly onOrbit: () => void
}

/**
 * 游玩模式相机：有玩家 → 第三人称环绕（平滑跟随目标，抑制角色弹跳导致的抖动）；无玩家 → 自由飞行。
 * 「旋转视角」绑定（默认左键）拖拽旋转相机，左键短按松开触发轻击，右键松开触发重击；
 * 攻击均携带按住时长供蓄力守卫区分点按/长按，拖拽视角时该次攻击不触发。
 * 「锁定目标」绑定（默认中键，可改绑键盘）切换镜头锁定：锁定期间环绕角平滑转向「玩家 → 目标」方向、视点平滑过渡并对准目标，拖拽旋转超过点击阈值后解除。
 */
export const setupPlayCamera = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    getTarget: () => Vector3 | undefined,
    mouseAttack?: MouseAttackCallbacks,
    lockTarget?: CameraLockTarget,
): (dt: number) => void => {
    const input = getInputRegistry()
    let yaw = Math.PI
    let pitch = Math.PI / 6
    let distance = 6
    /** 正在按住「旋转视角」绑定的鼠标按键（undefined = 未按下） */
    let orbitButton: number | undefined
    /** 旋转键按下后累计移动距离（像素），用于区分 click / drag */
    let dragDist = 0
    /** 攻击键按下时刻（performance.now()，undefined = 未按下），松开时算按住时长 */
    let leftDownAt: number | undefined
    let rightDownAt: number | undefined
    /** 平滑后的跟随目标（EMA），避免角色弹跳直接传导到相机 */
    const smoothedTarget = new Vector3()
    let hasSmoothedTarget = false
    /** 视点（lookAt 目标）：锁定/取消锁定时在玩家与锁定目标之间平滑混合 */
    const lookPoint = new Vector3()
    /** 最近一次有效锁定瞄准点（解除锁定后淡出期间继续使用） */
    const lastAimPoint = new Vector3()
    /** 视点混合权重（0 = 对准玩家，1 = 对准锁定目标） */
    let lockViewBlend = 0

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (input.matchesMouseButton('lock_target', e.button)) {
            /* 阻止中键自动滚动 */
            e.preventDefault()
            lockTarget?.onToggle()
        }
        if (input.matchesMouseButton('mouse_orbit', e.button)) {
            orbitButton = e.button
            dragDist = 0
            element.focus()
        }
        if (e.button === 0) {
            leftDownAt = performance.now()
            /* 左键按下即开始蓄力（可蓄力远程武器；非蓄力武器为空操作）。拖拽会取消。 */
            mouseAttack?.onLightAttackStart?.()
        }
        if (e.button === 2) {
            e.preventDefault()
            rightDownAt = performance.now()
            /* 右键按下即开始重击蓄力（近战重击；非蓄力武器为空操作）。失焦会取消。 */
            mouseAttack?.onHeavyAttackStart?.()
        }
    })
    element.addEventListener('contextmenu', (e: Event) => {
        /* 仅阻止浏览器右键菜单：不清空攻击键计时、不取消蓄力——
         * 部分平台 contextmenu 先于 mouseup 触发，若在此取消会中断右键重击 / 左键远程蓄力 */
        e.preventDefault()
    })
    window.addEventListener('blur', () => {
        orbitButton = undefined
        leftDownAt = undefined
        rightDownAt = undefined
        mouseAttack?.onLightAttackCancel?.()
        mouseAttack?.onHeavyAttackCancel?.()
    })
    window.addEventListener('mouseup', (e: MouseEvent) => {
        /* 本次拖拽是否达到点击阈值之外的位移（拖拽视角不触攻击） */
        const dragged = e.button === orbitButton && dragDist >= CLICK_DRAG_THRESHOLD
        if (e.button === orbitButton) orbitButton = undefined
        if (e.button === 0) {
            if (!dragged && leftDownAt !== undefined) {
                mouseAttack?.onLightAttack((performance.now() - leftDownAt) / 1000)
            } else {
                /* 拖拽/失焦：取消蓄力（若已进入蓄力），不发射 */
                mouseAttack?.onLightAttackCancel?.()
            }
            leftDownAt = undefined
        }
        if (e.button === 2 && !dragged && rightDownAt !== undefined) {
            /* 重击在松开时触发：携带按住时长（可蓄力重击已由 start 进入蓄力，松开走 end 结束） */
            mouseAttack?.onHeavyAttack((performance.now() - rightDownAt) / 1000)
            rightDownAt = undefined
        } else if (e.button === 2) {
            /* 右键拖拽（若改绑）或异常：取消重击蓄力 */
            mouseAttack?.onHeavyAttackCancel?.()
        }
    })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (orbitButton === undefined) return
        const mx = e.movementX
        const my = e.movementY
        dragDist += Math.hypot(mx, my)
        /* 达到点击阈值才算真实拖拽才解除锁定（与 click/drag 判定一致），避免攻击点击时的指针抖动误解除 */
        if (dragDist >= CLICK_DRAG_THRESHOLD) lockTarget?.onOrbit()
        yaw -= mx * ORBIT_SENSITIVITY
        pitch -= my * ORBIT_SENSITIVITY
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
    })

    element.addEventListener('wheel', (e: WheelEvent) => {
        const target = getTarget()
        if (target) {
            e.preventDefault()
            distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance + e.deltaY * ZOOM_SPEED))
        }
    })

    return (dt: number) => {
        /* 「锁定目标」支持键盘改绑：鼠标绑定在 mousedown 中经 matchesMouseButton 处理，键盘走动作边沿 */
        if (input.wasActionPressed('lock_target')) lockTarget?.onToggle()
        const target = getTarget()
        if (target) {
            /* 帧率无关的 EMA 平滑：1 - exp(-k·dt) */
            const k = 1 - Math.exp(-CAMERA_SMOOTH_FACTOR * dt)
            if (!hasSmoothedTarget) {
                smoothedTarget.copy(target)
                hasSmoothedTarget = true
            } else {
                smoothedTarget.lerp(target, k)
            }
            /* 锁定期间：环绕角平滑转向「玩家 → 目标」方向（相机绕到目标对侧） */
            const aimPoint = lockTarget?.getAimPoint()
            if (aimPoint) {
                lastAimPoint.copy(aimPoint)
                const desiredYaw = Math.atan2(smoothedTarget.x - aimPoint.x, smoothedTarget.z - aimPoint.z)
                yaw += wrapAngle(desiredYaw - yaw) * (1 - Math.exp(-LOCK_ON_TURN_FACTOR * dt))
            }
            camera.position.set(
                smoothedTarget.x + distance * Math.sin(yaw) * Math.cos(pitch),
                smoothedTarget.y + distance * Math.sin(pitch),
                smoothedTarget.z + distance * Math.cos(yaw) * Math.cos(pitch),
            )
            /* 视点平滑过渡：锁定/解除均不跳变（解除后沿用最后瞄准点淡出回玩家） */
            lockViewBlend += ((aimPoint ? 1 : 0) - lockViewBlend) * (1 - Math.exp(-LOCK_ON_BLEND_FACTOR * dt))
            lookPoint.copy(smoothedTarget).lerp(lastAimPoint, lockViewBlend)
            camera.lookAt(lookPoint)
            return
        }

        camera.rotation.order = 'YXZ'
        camera.rotation.set(pitch, yaw, 0)
        applyFreeFlightMovement(camera, input)
    }
}
