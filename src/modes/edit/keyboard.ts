import {type PerspectiveCamera} from 'three'
import {applyFreeFlightMovement} from '../free_flight.ts'

/**
 * WASD+EQ 第一人称相机移动。
 * 支持启用/禁用（setEnabled），用于编辑/游玩模式切换。
 * 返回 updater 函数，由主循环每帧调用。
 */
export const setupKeyboardCamera = (camera: PerspectiveCamera): {
    updater: () => void
    setEnabled: (v: boolean) => void
} => {
    const keys: Record<string, boolean> = {}
    let enabled = true

    const onKeyDown = (e: KeyboardEvent) => {
        if (!enabled) return
        keys[e.code] = true
    }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
    const onBlur = () => { for (const k in keys) keys[k] = false }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const updater = (): void => {
        if (!enabled) return
        applyFreeFlightMovement(camera, keys)
    }

    return {updater, setEnabled: (v: boolean) => { enabled = v } }
}
