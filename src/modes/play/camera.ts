import {Vector3, type PerspectiveCamera} from 'three'
import {ZOOM_SPEED, MIN_DISTANCE, MAX_DISTANCE, CAMERA_SMOOTH_FACTOR} from './constants.ts'
import {ORBIT_SENSITIVITY} from '../constants.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {applyFreeFlightMovement} from '../free_flight.ts'

const CLICK_DRAG_THRESHOLD = 5

export interface MouseAttackCallbacks {
    /** 轻击（左键松开且未拖拽），参数 = 按住时长（秒，用于蓄力守卫） */
    onLightAttack: (holdSeconds: number) => void
    /** 重击（右键松开），参数 = 按住时长（秒，用于蓄力守卫） */
    onHeavyAttack: (holdSeconds: number) => void
}

/**
 * 游玩模式相机：有玩家 → 第三人称环绕（平滑跟随目标，抑制角色弹跳导致的抖动）；无玩家 → 自由飞行。
 * 左键拖拽旋转相机，左键短按松开触发轻击，右键松开触发重击；均携带按住时长供蓄力守卫区分点按/长按。
 */
export const setupPlayCamera = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    getTarget: () => Vector3 | undefined,
    mouseAttack?: MouseAttackCallbacks,
): (dt: number) => void => {
    const input = getInputRegistry()
    let yaw = Math.PI
    let pitch = Math.PI / 6
    let distance = 6
    let isDown = false
    /** 左键按下后累计移动距离（像素），用于区分 click / drag */
    let dragDist = 0
    /** 攻击键按下时刻（performance.now()，undefined = 未按下），松开时算按住时长 */
    let leftDownAt: number | undefined
    let rightDownAt: number | undefined
    /** 平滑后的跟随目标（EMA），避免角色弹跳直接传导到相机 */
    const smoothedTarget = new Vector3()
    let hasSmoothedTarget = false

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) {
            isDown = true
            dragDist = 0
            leftDownAt = performance.now()
            element.focus()
        }
        if (e.button === 2) {
            e.preventDefault()
            rightDownAt = performance.now()
        }
    })
    element.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault()
        isDown = false
        leftDownAt = undefined
        rightDownAt = undefined
    })
    window.addEventListener('blur', () => {
        isDown = false
        leftDownAt = undefined
        rightDownAt = undefined
    })
    window.addEventListener('mouseup', (e: MouseEvent) => {
        if (e.button === 0) {
            if (isDown && dragDist < CLICK_DRAG_THRESHOLD && leftDownAt !== undefined) {
                mouseAttack?.onLightAttack((performance.now() - leftDownAt) / 1000)
            }
            isDown = false
            leftDownAt = undefined
        }
        if (e.button === 2 && rightDownAt !== undefined) {
            /* 重击改在松开时触发：携带按住时长，支持右键蓄力 */
            mouseAttack?.onHeavyAttack((performance.now() - rightDownAt) / 1000)
            rightDownAt = undefined
        }
    })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        const mx = e.movementX
        const my = e.movementY
        dragDist += Math.hypot(mx, my)
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
            camera.position.set(
                smoothedTarget.x + distance * Math.sin(yaw) * Math.cos(pitch),
                smoothedTarget.y + distance * Math.sin(pitch),
                smoothedTarget.z + distance * Math.cos(yaw) * Math.cos(pitch),
            )
            camera.lookAt(smoothedTarget)
            return
        }

        camera.rotation.order = 'YXZ'
        camera.rotation.set(pitch, yaw, 0)
        applyFreeFlightMovement(camera, input)
    }
}
