import {Vector3, type PerspectiveCamera} from 'three'
import {MOVE_STEP} from './constants.ts'

const _forward = new Vector3()
const _right = new Vector3()

/** 自由飞行相机每帧移动：根据按键更新 camera.position，edit 和 play 模式共用 */
export const applyFreeFlightMovement = (camera: PerspectiveCamera, keys: Record<string, boolean>): void => {
    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.crossVectors(_forward, camera.up).normalize()

    if (keys['KeyW']) camera.position.addScaledVector(_forward, MOVE_STEP)
    if (keys['KeyS']) camera.position.addScaledVector(_forward, -MOVE_STEP)
    if (keys['KeyA']) camera.position.addScaledVector(_right, -MOVE_STEP)
    if (keys['KeyD']) camera.position.addScaledVector(_right, MOVE_STEP)
    if (keys['KeyE']) camera.position.addScaledVector(camera.up, MOVE_STEP)
    if (keys['KeyQ']) camera.position.addScaledVector(camera.up, -MOVE_STEP)
}
