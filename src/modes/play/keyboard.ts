import {Vector3, type PerspectiveCamera} from 'three'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import {getInputRegistry} from '../../input/registry.ts'

export const setupPlayerKeyboard = (
    camera: PerspectiveCamera,
    characterSystem: CharacterEntitySystem,
): () => void => {
    const input = getInputRegistry()
    const forward = new Vector3()
    const right = new Vector3()

    return () => {
        camera.getWorldDirection(forward)
        forward.y = 0
        forward.normalize()
        right.crossVectors(forward, camera.up).normalize()

        let dx = 0
        let dz = 0
        if (input.isActionActive('move_forward')) { dx += forward.x; dz += forward.z }
        if (input.isActionActive('move_backward')) { dx -= forward.x; dz -= forward.z }
        if (input.isActionActive('move_left')) { dx -= right.x; dz -= right.z }
        if (input.isActionActive('move_right')) { dx += right.x; dz += right.z }

        const sprinting = input.isActionActive('sprint')
        const jumped = input.wasActionPressed('jump')
        characterSystem.setPlayerMove(dx, dz, jumped, forward.x, forward.z, sprinting)
    }
}
