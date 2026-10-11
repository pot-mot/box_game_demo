import {type PerspectiveCamera} from 'three'
import {ORBIT_SENSITIVITY} from './constants.ts'
import {getInputRegistry} from '../input/registry.ts'
import type {InputAction} from '../input/types.ts'
import {applyFreeFlightMovement} from './free_flight.ts'

/**
 * 鼠标拖拽旋转相机（偏航/俯仰）：edit 与 bone_edit 模式共用。
 * 监听 mousedown/mousemove/mouseup，按键取自操作设置中的「旋转视角」绑定。
 * mouseActions 为该模式下可绑定的指针动作集合：当某按键被集合中「旋转视角」之外的绑定命中
 * （如编辑模式的「生成物体」= Ctrl+左键）时，该次按下让位给绑定动作，不触发旋转。
 */
export const setupMouseOrbit = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    mouseActions: readonly InputAction[],
): {
    setOrientation: (yaw: number, pitch: number) => void
    setEnabled: (v: boolean) => void
} => {
    const input = getInputRegistry()
    let yaw = 0
    let pitch = 0
    let isDown = false
    let enabled = true

    const applyRotation = (): void => {
        camera.rotation.y = yaw
        camera.rotation.x = pitch
    }

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (!enabled) return
        /* 该按键被本模式「修饰键+鼠标」的其它动作覆盖（如编辑模式「生成物体」= Ctrl+左键）时不参与旋转 */
        if (input.isMouseButtonOverridden(e.button, mouseActions, 'mouse_orbit')) return
        if (input.matchesMouseButton('mouse_orbit', e.button)) {
            isDown = true
            element.focus()
        }
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
 * WASD+ZX 第一人称相机移动（edit 与 bone_edit 模式共用）。
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