/**
 * 持握模式（角色当前如何握持武器 / 武器可支持哪些握持方式）。
 *
 * 三态与武器数据一一对应：
 * - `one_handed` 单持：仅主手握持，副手空置
 * - `two_handed` 双手共持：双手握同一把武器（攻击时左手链 IK 贴合主手武器）
 * - `dual_wield` 双持：左右手各握一把武器（副手网格由 `offhandMesh` 提供）
 *
 * 角色实体持久化当前 `holdMode`；武器以 `holdModes` 数组声明**可支持的全部模式**，
 * 并以持握模式为键的 map 提供各模式对应的攻击连段（见 `attack_chain.ts` 的 `HoldModeAttacks`）。
 */

export const HOLD_MODES = ['one_handed', 'two_handed', 'dual_wield'] as const
export type HoldMode = typeof HOLD_MODES[number]

/** 持握模式中文名（面向玩家的面板 / 展示标签） */
export const HOLD_MODE_LABELS: Readonly<Record<HoldMode, string>> = {
    one_handed: '单持',
    two_handed: '双手共持',
    dual_wield: '双持',
}

/** 运行时/存档校验：任意值是否可窄化为持握模式（旧存档安全回退用） */
export const isHoldMode = (value: unknown): value is HoldMode =>
    typeof value === 'string' && (HOLD_MODES as readonly string[]).includes(value)
