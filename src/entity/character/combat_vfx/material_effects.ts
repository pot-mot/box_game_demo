import {Mesh, MeshStandardMaterial} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import {
    DAMAGE_FLASH_COLOR,
    DAMAGE_FLASH_DURATION,
    DAMAGE_FLASH_EMISSIVE,
    INVINCIBLE_FLASH_COLOR,
    INVINCIBLE_FLASH_EMISSIVE,
    INVINCIBLE_FLASH_OPACITY,
} from './constants.ts'

/**
 * 角色材质表面效果统一封装：受击闪红（时间驱动）与翻滚无敌闪白（状态驱动）。
 *
 * 两种效果都作用在同一批 `MeshStandardMaterial`（身体 / 护甲 / 武器）上，若各自快照与还原会互相
 * 覆盖（如无敌结束恰好受击），故由本模块集中管理：
 * - **惰性快照**：首个效果激活时收集材质并快照 color / emissive / opacity / transparent，
 *   这样阵营改色（recolor）与换装（材质重建）后开始的效果能以当时外观为基准恢复；
 * - **优先级**：受击闪红 > 无敌闪白；半透明只由无敌控制，效果叠加时不会来回切换 transparent；
 * - **统一还原**：最后一个效果结束时写回快照并清空缓存（不透明状态仅在真正变化时置 needsUpdate）。
 */
export interface MaterialEffects {
    /** 每帧推进：受击闪红倒计时结束自动回落（无效果时安全空转） */
    tick: (dt: number) => void
    /** 受击：触发闪红（无敌期间不会收到该回调，applyDamage 已免疫） */
    onDamage: (amount: number) => void
    /** 翻滚无敌帧开关：由 world 每帧按 `combat.invincibleTimer > 0` 驱动 */
    setInvincible: (active: boolean) => void
}

interface MaterialSnapshot {
    readonly material: MeshStandardMaterial
    readonly color: number
    readonly emissive: number
    readonly opacity: number
    readonly transparent: boolean
}

/** 遍历 Group 收集所有 MeshStandardMaterial（含护甲与武器子节点） */
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

/** 仅在透明状态真正变化时请求着色器重编译（避免每帧切换触发无谓重建） */
const setTransparent = (material: MeshStandardMaterial, transparent: boolean): void => {
    if (material.transparent === transparent) return
    material.transparent = transparent
    material.needsUpdate = true
}

export const createMaterialEffects = (entity: CharacterEntity): MaterialEffects => {
    let entries: MaterialSnapshot[] = []
    let damageTimer = 0
    let invincible = false

    /** 首个效果激活时快照当前外观（阵营改色/换装后不会被旧颜色覆盖） */
    const capture = (): void => {
        if (entries.length > 0) return
        entries = collectMaterials(entity).map((mat) => ({
            material: mat,
            color: mat.color.getHex(),
            emissive: mat.emissive.getHex(),
            opacity: mat.opacity,
            transparent: mat.transparent,
        }))
    }

    /** 全部效果结束：写回快照并清空（下次效果重新采集） */
    const restore = (): void => {
        for (const e of entries) {
            e.material.color.setHex(e.color)
            e.material.emissive.setHex(e.emissive)
            e.material.opacity = e.opacity
            setTransparent(e.material, e.transparent)
        }
        entries = []
    }

    /** 把当前生效效果写入材质（受击闪红优先；无敌负责半透明） */
    const sync = (): void => {
        if (damageTimer <= 0 && !invincible) {
            if (entries.length > 0) restore()
            return
        }
        capture()
        const flash = damageTimer > 0
        for (const e of entries) {
            e.material.color.setHex(flash ? DAMAGE_FLASH_COLOR : INVINCIBLE_FLASH_COLOR)
            e.material.emissive.setHex(flash ? DAMAGE_FLASH_EMISSIVE : INVINCIBLE_FLASH_EMISSIVE)
            e.material.opacity = invincible ? INVINCIBLE_FLASH_OPACITY : e.opacity
            setTransparent(e.material, invincible)
        }
    }

    const tick = (dt: number): void => {
        if (damageTimer <= 0) return
        damageTimer = Math.max(0, damageTimer - dt)
        sync()
    }

    const onDamage = (_amount: number): void => {
        damageTimer = DAMAGE_FLASH_DURATION
        sync()
    }

    const setInvincible = (active: boolean): void => {
        if (invincible === active) return
        invincible = active
        sync()
    }

    return {tick, onDamage, setInvincible}
}
