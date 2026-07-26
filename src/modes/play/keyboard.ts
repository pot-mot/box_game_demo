import {Vector3, type PerspectiveCamera} from 'three'
import type {PlayerContext} from '../../entity/player/physics/world.ts'

/** 游玩模式玩家键盘控制（WASD 移动 + Space 跳跃） */
export const setupPlayerKeyboard = (
    camera: PerspectiveCamera,
    player: PlayerContext,
): () => void => {
    const keys: Record<string, boolean> = {}
    const forward = new Vector3()
    const right = new Vector3()

    const onKeyDown = (e: KeyboardEvent) => {
        keys[e.code] = true
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault()
            player.jump()
        }
    }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
    const onBlur = () => { for (const k in keys) keys[k] = false }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

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
