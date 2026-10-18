import type {CharacterConfig} from '../../../character/types.ts'
import {bodyFormOf} from './index.ts'

/**
 * 体形几何派生（统一读取 `BodyForm` 属性，避免各处写死人形常量）：
 * AI 视线 / 导航 / 受击判定 / 分离等跨体形逻辑一律经此取用当前实体的体形尺寸。
 * 全部返回值已乘 `config.scale`。
 */

/** 眼部高度（脚底原点起算） */
export const formEyeHeight = (config: CharacterConfig): number =>
    bodyFormOf(config.bodyFormId).eyeHeight * config.scale

/** 脚底原点到刚体中心的 Y 偏移 */
export const formCenterOffsetY = (config: CharacterConfig): number =>
    bodyFormOf(config.bodyFormId).centerOffsetY * config.scale

/** 水平外接半径（分离 / 目标体半径用）= max(width, depth) / 2 */
export const formBodyRadius = (config: CharacterConfig): number => {
    const size = bodyFormOf(config.bodyFormId).size
    return (Math.max(size.width, size.depth) / 2) * config.scale
}

/** 受击包围盒半长（竖直胶囊包围盒，与 `size` 一致） */
export const formHurtHalf = (config: CharacterConfig): {x: number; y: number; z: number} => {
    const size = bodyFormOf(config.bodyFormId).size
    return {
        x: (size.width / 2) * config.scale,
        y: (size.height / 2) * config.scale,
        z: (size.depth / 2) * config.scale,
    }
}
