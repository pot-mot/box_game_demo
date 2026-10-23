/**
 * Vitest 全局装配（`vitest.config.ts` 的 `setupFiles`）：
 * 导入体形注册表以触发武器目录装配（`registerFormWeapons`），使领域层 `createWeaponRuntime(id)`
 * 在测试中可解析武器 id —— 与生产 `main.ts` 经 `world.ts` 导入 `body_form/index.ts` 的行为一致。
 */
import './entity/character/body_form/index.ts'

/** 支撑手测试的视觉容忍上限（实测最大约 0.144m；不是烘焙求解精度） */
export const SUPPORT_HAND_VISUAL_TOLERANCE = 0.15
