import {Vector3, type PerspectiveCamera} from 'three'
import type {PlayerContext} from './physics/world.ts'

/** 玩家键盘输入控制（WASD 移动 + Space 跳跃） */
export const setupPlayerInput = (
    camera: PerspectiveCamera,
    player: PlayerContext,
    element: HTMLElement,
): () => void => {
    const keys: Record<string, boolean> = {}
    const forward = new Vector3()
    const right = new Vector3()

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
    const onBlur = () => { for (const k in keys) keys[k] = false }

    element.addEventListener('keydown', onKeyDown)
    element.addEventListener('keyup', onKeyUp)
    element.addEventListener('blur', onBlur)

    // 跳跃单独用 keydown 防止按住连跳
    element.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault()
            player.jump()
        }
    })

    return () => {
        if (!player.getPlayer()) return

        camera.getWorldDirection(forward)
        forward.y = 0
        forward.normalize()
        right.crossVectors(forward, camera.up).normalize()

        let dx = 0
        let dz = 0
        if (keys['KeyW']) { dx += forward.x; dz += forward.z }
        if (keys['KeyS']) { dx -= forward.x; dz -= forward.z }
        if (keys['KeyA']) { dx -= right.x; dz -= right.z }
        if (keys['KeyD']) { dx += right.x; dz += right.z }

        player.move(dx, dz)
    }
}
