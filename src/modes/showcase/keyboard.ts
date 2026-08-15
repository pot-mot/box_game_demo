import type {OrbitCamera} from './scene.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {MOVE_STEP} from '../constants.ts'

/**
 * WASD+EQ 轨道相机自由飞行式平移。
 * 对标 edit/keyboard.ts 的 setupKeyboardCamera：基于相机朝向计算世界位移，
 * 再把同样的位移施加到轨道相机 target（相机随 applyCamera 同步跟随），
 * 视角方向保持不变，效果与 edit 模式的自由飞行一致（无固定焦点）。
 * 支持启用/禁用（setEnabled），聚焦时禁用、未聚焦时启用。
 * 返回 updater 函数，由主循环每帧调用。
 */
export const setupKeyboardCamera = (orbit: OrbitCamera): {
    updater: () => void
    setEnabled: (v: boolean) => void
} => {
    const input = getInputRegistry()
    let enabled = true

    const updater = (): void => {
        if (!enabled) return
        const yaw = orbit.getYaw()
        /* 水平前向 = 相机看向 target 的方向（-sin, -cos），右向 = (cos, -sin)，
         * 与 edit 模式 free_flight.ts 的 getWorldDirection + crossVectors 语义一致 */
        const fwdX = -Math.sin(yaw)
        const fwdZ = -Math.cos(yaw)
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)

        let dx = 0
        let dz = 0
        if (input.isActionActive('move_forward')) { dx += fwdX * MOVE_STEP; dz += fwdZ * MOVE_STEP }
        if (input.isActionActive('move_backward')) { dx -= fwdX * MOVE_STEP; dz -= fwdZ * MOVE_STEP }
        if (input.isActionActive('move_left')) { dx -= rightX * MOVE_STEP; dz -= rightZ * MOVE_STEP }
        if (input.isActionActive('move_right')) { dx += rightX * MOVE_STEP; dz += rightZ * MOVE_STEP }

        let dy = 0
        if (input.isActionActive('move_up')) dy += MOVE_STEP
        if (input.isActionActive('move_down')) dy -= MOVE_STEP

        if (dx !== 0 || dy !== 0 || dz !== 0) {
            orbit.translateTargetBy(dx, dy, dz)
        }
    }

    return {updater, setEnabled: (v: boolean) => { enabled = v }}
}
