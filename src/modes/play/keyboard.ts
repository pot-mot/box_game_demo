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

        /* 移动技能键：动作 id 保留 sprint（兼容既有键位存档），语义为翻滚 */
        const rolling = input.wasActionPressed('sprint')
        const jumped = input.wasActionPressed('jump')
        characterSystem.setPlayerMove(dx, dz, jumped, forward.x, forward.z, rolling)

        /* 持握模式切换（默认 Ctrl）：isActionActive 走最长组合遮蔽，
         * Ctrl+S / Ctrl+O 按下时该动作被更长组合遮蔽，不会误触发切换 */
        if (input.wasActionPressed('cycle_hold_mode') && input.isActionActive('cycle_hold_mode')) {
            characterSystem.cyclePlayerHoldMode()
        }
    }
}
