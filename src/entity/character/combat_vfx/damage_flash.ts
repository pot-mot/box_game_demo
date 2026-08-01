import {MeshStandardMaterial} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import {DAMAGE_FLASH_DURATION, DAMAGE_FLASH_COLOR} from './constants.ts'

/** 受击闪红管理 */
export interface FlashState {
    tick: (dt: number) => void
    onDamage: (amount: number) => void
}

export const createDamageFlash = (entity: CharacterEntity): FlashState => {
    const mesh = entity.mesh
    const mat = mesh.material
    if (!(mat instanceof MeshStandardMaterial)) {
        return {tick: () => {}, onDamage: () => {}}
    }

    let flashTimer = 0
    const originalColor = mat.color.getHex()
    const originalEmissive = mat.emissive.getHex()

    const tick = (dt: number): void => {
        if (flashTimer <= 0) return
        flashTimer -= dt
        if (flashTimer <= 0) {
            if (mesh.material instanceof MeshStandardMaterial) {
                mesh.material.color.setHex(originalColor)
                mesh.material.emissive.setHex(originalEmissive)
            }
        }
    }

    const onDamage = (_amount: number): void => {
        if (!(mesh.material instanceof MeshStandardMaterial)) return
        mesh.material.color.setHex(DAMAGE_FLASH_COLOR)
        mesh.material.emissive.setHex(0x330000)
        flashTimer = DAMAGE_FLASH_DURATION
    }

    return {tick, onDamage}
}
