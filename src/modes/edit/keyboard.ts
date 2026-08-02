import {type PerspectiveCamera} from 'three'
import {getInputRegistry} from '../../input/registry.ts'
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
    const input = getInputRegistry()
    let enabled = true

    const updater = (): void => {
        if (!enabled) return
        applyFreeFlightMovement(camera, input)
    }

    return {updater, setEnabled: (v: boolean) => { enabled = v } }
}
