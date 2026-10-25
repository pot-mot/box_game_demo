/** 体力上限基础值 */
export const DEFAULT_STAMINA_MAX = 5
/** 扣除体力后延迟开始恢复（秒） */
export const DEFAULT_STAMINA_REGEN_DELAY = 0.5
/** 延迟结束后每秒恢复的体力值 */
export const DEFAULT_STAMINA_REGEN_PER_SEC = 2
/** 持续消耗状态（跑步 / 飞行 / 持盾格挡）每秒消耗基础值 */
export const DEFAULT_STAMINA_DRAIN_PER_SEC = 0.2
/** 进入一次性动作状态（攻击 / 翻滚 / 跳跃）的体力消耗基础值 */
export const DEFAULT_STAMINA_ENTRY_COST = 0.5

/** 持续状态重新进入所需的最低体力比例（相对上限）：耗尽退出后需恢复到此比例才可再次进入，避免按住按键反复进出 */
export const STAMINA_SUSTAINED_ENTRY_MIN_RATIO = 0.1
