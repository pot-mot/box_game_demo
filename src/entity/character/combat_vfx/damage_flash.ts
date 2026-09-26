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

/** 遍历 Group 收集所有 MeshStandardMaterial */
const collectMaterials = (entity: CharacterEntity): MeshStandardMaterial[] => {
    const materials: MeshStandardMaterial[] = []
    entity.appearanceGroup.traverse((obj) => {
        if (!(obj instanceof Mesh)) return
        const list = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of list) {
            if (mat instanceof MeshStandardMaterial) materials.push(mat)
        }
    })
    return materials
}

export const createDamageFlash = (entity: CharacterEntity): FlashState => {
    /* 闪红开始时才快照颜色：阵营改色（recolor）与换装都会改动/重建材质，
     * 若在构造期快照，恢复时会写回旧的阵营色（编辑模式改阵营后受击即回退的根因） */
    let entries: FlashEntry[] = []
    let flashTimer = 0

    const tick = (dt: number): void => {
        if (flashTimer <= 0) return
        flashTimer -= dt
        if (flashTimer <= 0) {
            for (const e of entries) {
                e.material.color.setHex(e.originalColor)
                e.material.emissive.setHex(e.originalEmissive)
            }
            entries = []
        }
    }

    const onDamage = (_amount: number): void => {
        /* 连击刷新时仍在闪红，沿用首帧快照，避免把闪红颜色当成「原色」存下 */
        if (flashTimer <= 0) {
            entries = collectMaterials(entity).map((mat) => ({
                material: mat,
                originalColor: mat.color.getHex(),
                originalEmissive: mat.emissive.getHex(),
            }))
        }
        for (const e of entries) {
            e.material.color.setHex(DAMAGE_FLASH_COLOR)
            e.material.emissive.setHex(0x330000)
        }
        flashTimer = DAMAGE_FLASH_DURATION
    }

    return {tick, onDamage}
}
