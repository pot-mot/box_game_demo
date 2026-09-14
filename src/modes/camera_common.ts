import {type PerspectiveCamera} from 'three'
import {ORBIT_SENSITIVITY} from './constants.ts'
import {getInputRegistry} from '../input/registry.ts'
import {applyFreeFlightMovement} from './free_flight.ts'

/**
 * 鼠标拖拽旋转相机（偏航/俯仰）：edit 与 bone_edit 模式共用。
 * 监听 mousedown/mousemove/mouseup（仅左键拖拽旋转）。
 */
export const setupMouseOrbit = (camera: PerspectiveCamera, element: HTMLElement): {
    setOrientation: (yaw: number, pitch: number) => void
    setEnabled: (v: boolean) => void
} => {
    let yaw = 0
    let pitch = 0
    let isDown = false
    let enabled = true

    const applyRotation = (): void => {
        camera.rotation.y = yaw
        camera.rotation.x = pitch
    }

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0 && enabled) { isDown = true; element.focus() }
    })
    window.addEventListener('mouseup', () => { isDown = false })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown || !enabled) return
        yaw -= e.movementX * ORBIT_SENSITIVITY
        pitch -= e.movementY * ORBIT_SENSITIVITY
        // 限制俯仰角在 ±90° 内（留 0.01rad 间隙避免万向锁）
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
        applyRotation()
    })

    return {
        setOrientation: (y: number, p: number) => {
            yaw = y
            pitch = p
            applyRotation()
        },
        setEnabled: (v: boolean) => {
            enabled = v
            if (!v) isDown = false
        },
    }
}

/**
 * WASD+EQ 第一人称相机移动（edit 与 bone_edit 模式共用）。
 * 支持启用/禁用（setEnabled）；返回 updater 函数，由主循环每帧调用。
 */
export const setupKeyboardCamera = (camera: PerspectiveCamera): {
    updater: () => void
    setEnabled: (v: boolean) => void
} => {
    const input = getInputRegistry()
    let enabled = true

    const updater = (): void => {
        if (!enabled) return
        applyFreeFlightMovement(camera, input)
    }

    return {updater, setEnabled: (v: boolean) => { enabled = v } }
}