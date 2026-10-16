import type {ImpactLevel} from './impact.ts'

/** 默认子弹尺寸 */
export const BULLET_SIZE = 0.1

/** 固定减伤后的最小伤害（保底 1 点，防止高防完全免疫） */
export const MIN_DAMAGE = 1

/** 翻滚命中可破坏世界目标时的伤害（来源类别 roll） */
export const ROLL_WORLD_DAMAGE = 25

/** 爆炸默认冲击力（范围冲击：倒地级） */
export const EXPLOSION_DEFAULT_IMPACT: ImpactLevel = 'knockdown'

/** 爆炸默认削韧值 */
export const EXPLOSION_DEFAULT_POISE_DAMAGE = 6

/* ── 韧性 / 冲击反应默认值（角色属性缺省；可被角色配置与存档覆写） ── */

/** 韧性上限基础值（不含装备加成） */
export const DEFAULT_POISE_MAX = 20
/** 受击后韧性停止回充的延迟（秒） */
export const DEFAULT_POISE_REGEN_DELAY = 1.0
/** 延迟结束后每秒回充的韧性值 */
export const DEFAULT_POISE_REGEN_PER_SEC = 8
/** 倒地状态持续时间（秒） */
export const DEFAULT_KNOCKDOWN_DURATION = 0.7
/** 起身状态持续时间（秒；结束时韧性回满） */
export const DEFAULT_GET_UP_DURATION = 0.6

