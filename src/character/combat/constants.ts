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
/** 倒地状态总时长（秒；前一半完成倒下，后一半保持完全伏地不动） */
export const DEFAULT_KNOCKDOWN_DURATION = 1.4
/** 倒地动作占比：前 50% 完成倒下，之后保持最后一帧（明确的倒地停顿） */
export const KNOCKDOWN_FALL_RATIO = 0.5
/** 起身状态持续时间（秒；结束时韧性回满） */
export const DEFAULT_GET_UP_DURATION = 1.2

/* ── 起身前翻身（躺在地上转到正面朝下） ── */

/** 翻身 180° 用时（秒）：实际时长 = 水平转角 / 角速度（90° ≈ 0.125s） */
export const GET_UP_TURN_180_DURATION = 0.25
/** 翻身角速度（rad/s）：180° / 0.25s */
export const GET_UP_TURN_SPEED = Math.PI / GET_UP_TURN_180_DURATION

/* ── 起身动作时序（占起身全程比例；状态层根旋转与外观层姿势共用，保证手脚与身体同步） ── */

/** 撑地阶段结束比例：此段身体仍伏地，双手收到肩下撑住地面 */
export const GET_UP_PLANT_END = 0.32
/** 推起阶段结束比例：手臂蹬直、收腿把身体推到蹲姿；此后站直 */
export const GET_UP_PUSH_END = 0.72

