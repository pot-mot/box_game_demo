import {Vector3, type PerspectiveCamera} from 'three'
import {ZOOM_SPEED, MIN_DISTANCE, MAX_DISTANCE} from './constants.ts'
import {ORBIT_SENSITIVITY} from '../constants.ts'
import {applyFreeFlightMovement} from '../free_flight.ts'

const CLICK_DRAG_THRESHOLD = 5

export interface MouseAttackCallbacks {
    onLightAttack: () => void
    onHeavyAttack: () => void
}

/**
 * 游玩模式相机：有玩家 → 第三人称环绕；无玩家 → 自由飞行（与编辑模式共用 applyFreeFlightMovement）。
 * 左键拖拽旋转相机，左键短按触发轻击，右键触发重击。
 */
export const setupPlayCamera = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    getTarget: () => Vector3 | undefined,
    mouseAttack?: MouseAttackCallbacks,
): () => void => {
    let yaw = Math.PI
    let pitch = Math.PI / 6
    let distance = 6
    let isDown = false
    /** 左键按下后累计移动距离（像素），用于区分 click / drag */
    let dragDist = 0
    const keys: Record<string, boolean> = {}

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) {
            isDown = true
            dragDist = 0
            element.focus()
        }
        if (e.button === 2) {
            e.preventDefault()
            mouseAttack?.onHeavyAttack()
        }
    })
    element.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault()
        isDown = false
    })
    window.addEventListener('blur', () => { isDown = false })
    window.addEventListener('mouseup', (e: MouseEvent) => {
        if (e.button === 0) {
            if (isDown && dragDist < CLICK_DRAG_THRESHOLD) {
                mouseAttack?.onLightAttack()
            }
            isDown = false
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

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
        const target = getTarget()
        if (target) {
            camera.position.set(
                target.x + distance * Math.sin(yaw) * Math.cos(pitch),
                target.y + distance * Math.sin(pitch),
                target.z + distance * Math.cos(yaw) * Math.cos(pitch),
            )
            camera.lookAt(target)
            return
        }

        camera.rotation.order = 'YXZ'
        camera.rotation.set(pitch, yaw, 0)
        applyFreeFlightMovement(camera, keys)
    }
}
