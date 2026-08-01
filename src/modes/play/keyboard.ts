import {Vector3, type PerspectiveCamera} from 'three'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'

export const setupPlayerKeyboard = (
    camera: PerspectiveCamera,
    characterSystem: CharacterEntitySystem,
): () => void => {
    const keys: Record<string, boolean> = {}
    const forward = new Vector3()
    const right = new Vector3()
    let jumpThisFrame = false

    const onKeyDown = (e: KeyboardEvent) => {
        keys[e.code] = true
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault()
            jumpThisFrame = true
        }
    }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
    const onBlur = () => {
        for (const k in keys) keys[k] = false
        jumpThisFrame = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
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

        const sprinting = keys['ShiftLeft'] || keys['ShiftRight']
        characterSystem.setPlayerMove(dx, dz, jumpThisFrame, forward.x, forward.z, sprinting)

        jumpThisFrame = false
    }
}
