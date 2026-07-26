import {Vector3, type PerspectiveCamera} from 'three'
import {ZOOM_SPEED, MIN_DISTANCE, MAX_DISTANCE} from './constants.ts'
import {ORBIT_SENSITIVITY} from "../constants.ts";

/**
 * 游玩模式第三人称相机。
 * 始终围绕目标点（玩家位置）旋转，左键拖拽改变视角，滚轮缩放距离。
 * 返回 updater，由主循环每帧调用以同步相机位置。
 */
export const setupPlayCamera = (
    camera: PerspectiveCamera,
    element: HTMLElement,
    getTarget: () => Vector3 | undefined,
): () => void => {
    // 初始位置：玩家后方偏上
    let yaw = Math.PI
    let pitch = Math.PI / 6
    let distance = 6
    let isDown = false

    element.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) { isDown = true; element.focus() }
    })
    window.addEventListener('mouseup', () => { isDown = false })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        yaw -= e.movementX * ORBIT_SENSITIVITY
        pitch -= e.movementY * ORBIT_SENSITIVITY
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
    })

    element.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault()
        distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance + e.deltaY * ZOOM_SPEED))
    })

    return () => {
        const target = getTarget()
        if (!target) return
        // 球形坐标：偏航 → 左右绕行；俯仰 → 高低角度
        camera.position.set(
            target.x + distance * Math.sin(yaw) * Math.cos(pitch),
            target.y + distance * Math.sin(pitch),
            target.z + distance * Math.cos(yaw) * Math.cos(pitch),
        )
        camera.lookAt(target)
    }
}
