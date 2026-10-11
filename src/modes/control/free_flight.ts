import {Vector3, type PerspectiveCamera} from 'three'
import {MOVE_STEP} from '../constants.ts'
import type {InputAction} from '../../input/types.ts'
import {FREE_FLIGHT_BOOST_MULTIPLIER} from './constants.ts'

const _forward = new Vector3()
const _right = new Vector3()

/** 自由飞行相机运动最小接口，避免直接依赖完整 InputRegistry */
interface FreeFlightInput {
    isActionActive(action: InputAction): boolean
}

/**
 * 自由飞行相机每帧移动：根据按键更新 `camera.position`（第一人称，直接挪相机）。
 * 按住 `boost` 动作时按 `FREE_FLIGHT_BOOST_MULTIPLIER` 加速。玩家主控在无目标（无玩家）时作为兜底使用。
 */
export const applyFreeFlightMovement = (camera: PerspectiveCamera, input: FreeFlightInput): void => {
    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.crossVectors(_forward, camera.up).normalize()

    const step = MOVE_STEP * (input.isActionActive('boost') ? FREE_FLIGHT_BOOST_MULTIPLIER : 1)

    if (input.isActionActive('move_forward')) camera.position.addScaledVector(_forward, step)
    if (input.isActionActive('move_backward')) camera.position.addScaledVector(_forward, -step)
    if (input.isActionActive('move_left')) camera.position.addScaledVector(_right, -step)
    if (input.isActionActive('move_right')) camera.position.addScaledVector(_right, step)
    if (input.isActionActive('move_up')) camera.position.addScaledVector(camera.up, step)
    if (input.isActionActive('move_down')) camera.position.addScaledVector(camera.up, -step)
}
