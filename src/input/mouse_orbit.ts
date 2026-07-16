import {type PerspectiveCamera} from 'three'
import {ORBIT_SENSITIVITY} from './constants.ts'

/** 鼠标拖拽旋转相机（偏航/俯仰），监听 mousedown/mousemove/mouseup */
export const setupMouseOrbit = (camera: PerspectiveCamera, element: HTMLElement): void => {
    let yaw = 0
    let pitch = 0
    let isDown = false

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) { isDown = true; element.focus() }
    })
    window.addEventListener('mouseup', () => {
        isDown = false
    })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        yaw -= e.movementX * ORBIT_SENSITIVITY
        pitch -= e.movementY * ORBIT_SENSITIVITY
        // 限制俯仰角在 ±90° 内（留 0.01rad 间隙避免万向锁）
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
        camera.rotation.y = yaw
        camera.rotation.x = pitch
    })
}
