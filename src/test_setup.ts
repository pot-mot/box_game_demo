/**
 * Vitest 全局装配（`vitest.config.ts` 的 `setupFiles`）：
 * 导入体形注册表以触发武器目录装配（`registerFormWeapons`），使领域层 `createWeaponRuntime(id)`
 * 在测试中可解析武器 id —— 与生产 `main.ts` 经 `world.ts` 导入 `body_form/index.ts` 的行为一致。
 */
import './entity/character/body_form/index.ts'
