import {type PerspectiveCamera} from 'three'
import {ORBIT_SENSITIVITY} from './constants.ts'

export function setupMouseOrbit(camera: PerspectiveCamera, element: HTMLElement): void {
    let yaw = 0
    let pitch = 0
    let isDown = false

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) isDown = true
    })
    window.addEventListener('mouseup', () => {
        isDown = false
    })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        yaw -= e.movementX * ORBIT_SENSITIVITY
        pitch -= e.movementY * ORBIT_SENSITIVITY
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
        camera.rotation.y = yaw
        camera.rotation.x = pitch
    })
}
