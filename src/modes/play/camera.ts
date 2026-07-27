import {Vector3, type PerspectiveCamera} from 'three'
import {ZOOM_SPEED, MIN_DISTANCE, MAX_DISTANCE} from './constants.ts'
import {ORBIT_SENSITIVITY} from '../constants.ts'
import {applyFreeFlightMovement} from '../free_flight.ts'

/**
 * 游玩模式相机：有玩家 → 第三人称环绕；无玩家 → 自由飞行（与编辑模式共用 applyFreeFlightMovement）。
 */
export const setupPlayCamera = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    getTarget: () => Vector3 | undefined,
): () => void => {
    let yaw = Math.PI
    let pitch = Math.PI / 6
    let distance = 6
    let isDown = false
    const keys: Record<string, boolean> = {}

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) { isDown = true; element.focus() }
    })
    window.addEventListener('mouseup', () => { isDown = false })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        yaw -= e.movementX * ORBIT_SENSITIVITY
        pitch -= e.movementY * ORBIT_SENSITIVITY
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
