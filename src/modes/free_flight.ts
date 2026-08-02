import {Vector3, type PerspectiveCamera} from 'three'
import {MOVE_STEP} from './constants.ts'
import type {InputAction} from '../input/types.ts'

const _forward = new Vector3()
const _right = new Vector3()

/** 自由飞行相机运动最小接口，避免直接依赖完整 InputRegistry */
interface FreeFlightInput {
    isActionActive(action: InputAction): boolean
}

/** 自由飞行相机每帧移动：根据按键更新 camera.position，edit 和 play 模式共用 */
export const applyFreeFlightMovement = (camera: PerspectiveCamera, input: FreeFlightInput): void => {
    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.crossVectors(_forward, camera.up).normalize()

    if (input.isActionActive('move_forward')) camera.position.addScaledVector(_forward, MOVE_STEP)
    if (input.isActionActive('move_backward')) camera.position.addScaledVector(_forward, -MOVE_STEP)
    if (input.isActionActive('move_left')) camera.position.addScaledVector(_right, -MOVE_STEP)
    if (input.isActionActive('move_right')) camera.position.addScaledVector(_right, MOVE_STEP)
    if (input.isActionActive('move_up')) camera.position.addScaledVector(camera.up, MOVE_STEP)
    if (input.isActionActive('move_down')) camera.position.addScaledVector(camera.up, -MOVE_STEP)
}
