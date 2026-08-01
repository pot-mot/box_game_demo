import {MeshStandardMaterial, Mesh} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import {DAMAGE_FLASH_DURATION, DAMAGE_FLASH_COLOR} from './constants.ts'

/** 受击闪红管理 */
export interface FlashState {
    tick: (dt: number) => void
    onDamage: (amount: number) => void
}

interface FlashEntry {
    material: MeshStandardMaterial
    originalColor: number
    originalEmissive: number
}

/** 遍历 Group 收集所有 MeshStandardMaterial 的原始颜色 */
const collectMaterials = (entity: CharacterEntity): FlashEntry[] => {
    const entries: FlashEntry[] = []
    entity.appearanceGroup.traverse((obj) => {
        if (!(obj instanceof Mesh)) return
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of materials) {
            if (!(mat instanceof MeshStandardMaterial)) continue
            entries.push({
                material: mat,
                originalColor: mat.color.getHex(),
                originalEmissive: mat.emissive.getHex(),
            })
        }
    })
    return entries
}

export const createDamageFlash = (entity: CharacterEntity): FlashState => {
    const entries = collectMaterials(entity)
    if (entries.length === 0) {
        return {tick: () => {}, onDamage: () => {}}
    }

    let flashTimer = 0

    const tick = (dt: number): void => {
        if (flashTimer <= 0) return
        flashTimer -= dt
        if (flashTimer <= 0) {
            for (const e of entries) {
                e.material.color.setHex(e.originalColor)
                e.material.emissive.setHex(e.originalEmissive)
            }
        }
    }

    const onDamage = (_amount: number): void => {
        for (const e of entries) {
            e.material.color.setHex(DAMAGE_FLASH_COLOR)
            e.material.emissive.setHex(0x330000)
        }
        flashTimer = DAMAGE_FLASH_DURATION
    }

    return {tick, onDamage}
}
