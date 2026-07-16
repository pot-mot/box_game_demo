import {PerspectiveCamera, Vector3} from 'three'
import {MOVE_STEP} from './constants.ts'

/** 
 * WASD+EQ 第一人称相机移动。
 * 返回 updater 函数，由主循环每帧调用，不再自行启动 RAF。
 * 事件绑定到 canvas 元素，仅在 canvas 聚焦时响应键盘输入。
 */
export const setupKeyboardCamera = (camera: PerspectiveCamera, element: HTMLElement): () => void => {
    const keys: Record<string, boolean> = {}
    const forward = new Vector3()
    const right = new Vector3()

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
    const onBlur = () => { for (const k in keys) keys[k] = false }

    element.addEventListener('keydown', onKeyDown)
    element.addEventListener('keyup', onKeyUp)
    element.addEventListener('blur', onBlur)

    return () => {
        camera.getWorldDirection(forward)
        right.crossVectors(forward, camera.up).normalize()

        if (keys['KeyW']) camera.position.add(forward.clone().multiplyScalar(MOVE_STEP))
        if (keys['KeyS']) camera.position.add(forward.clone().multiplyScalar(-MOVE_STEP))
        if (keys['KeyA']) camera.position.add(right.clone().multiplyScalar(-MOVE_STEP))
        if (keys['KeyD']) camera.position.add(right.clone().multiplyScalar(MOVE_STEP))
        if (keys['KeyE']) camera.position.add(camera.up.clone().multiplyScalar(MOVE_STEP))
        if (keys['KeyQ']) camera.position.add(camera.up.clone().multiplyScalar(-MOVE_STEP))
    }
}
