/**
 * 弹丸分包常量 —— 物理尺寸 / 池容量 / 轨迹 / 特效参数集中于此，
 * 禁止散落到函数体内（见 AGENTS.md「常量集中」）。
 * 重力缺省值随武器数据放在 `character/weapon/ranged_weapon.ts`。
 */

// ── 物理 ──

/** 弹丸碰撞体半径（与形状扫描同源，避免命中判定漂移） */
export const PROJECTILE_RADIUS = 0.1
/** 弹丸碰撞组 / 交互掩码（mask 0 = sensor，不与任何物体产生物理交互） */
export const PROJECTILE_COLLISION_GROUP = 8
export const PROJECTILE_COLLISION_MASK = 0
/** 弹丸刚体附加质量（密度 0，质量完全由此决定） */
export const PROJECTILE_MASS = 0.01
/** 命中角色的宽容半径（覆盖角色碰撞半径 + 一帧内弹丸位移） */
export const PROJECTILE_HIT_RADIUS = 1.2
/** 弹丸初速低于该值时判定失速并回收 */
export const PROJECTILE_MIN_SPEED = 1
/** 弹丸坠出世界的 Y 阈值 */
export const PROJECTILE_KILL_Y = -10
/** 爆炸弹丸掉到该高度以下即就地引爆（正常已被地面扫描拦下） */
export const PROJECTILE_GROUND_DETONATE_Y = 0
/** 生成位置：沿射向前移 / 抬高（避免出生即撞自己） */
export const PROJECTILE_SPAWN_FORWARD = 0.5
export const PROJECTILE_SPAWN_HEIGHT = 0.3
/** 非魔法的命中闪光颜色（暖金火星） */
export const PROJECTILE_HIT_COLOR = 0xffd070

// ── 对象池 ──

/** 同屏在飞弹丸上限 */
export const PROJECTILE_POOL_MAX = 64
/** 每种视觉签名的空闲实例上限 */
export const VISUAL_POOL_MAX = 32
/** 特效槽位上限（同时存在的爆炸 / 命中特效） */
export const EFFECT_POOL_MAX = 24

// ── 轨迹（魔法球） ──

export const TRAIL_POINTS = 20
export const TRAIL_HALF_WIDTH = 0.05
export const TRAIL_LIFETIME = 0.22
export const TRAIL_MAX_OPACITY = 0.55
export const TRAIL_MIN_POINTS = 2

// ── 视觉尺寸 ──

/** 箭矢总长 */
export const ARROW_LENGTH = 0.55
/** 弩矢总长 */
export const BOLT_LENGTH = 0.34
/** 弹头（霰弹）总长 */
export const BULLET_LENGTH = 0.12
/** 投掷物自旋角速度（rad/s） */
export const THROWN_SPIN_SPEED = 18

/** 魔法球核心半径 */
export const ORB_CORE_RADIUS = 0.11
/** 魔法球外发光半径 */
export const ORB_GLOW_RADIUS = 0.2
/** 魔法球脉冲频率（rad/s）与幅度 */
export const ORB_PULSE_SPEED = 9
export const ORB_PULSE_AMPLITUDE = 0.15
/** 魔法球缺省颜色（武器模型无颜色信息时的回退） */
export const ORB_DEFAULT_COLOR = 0x66ccff

// ── 命中 / 爆炸特效 ──

/** 爆炸火球存活时间（秒） */
export const EFFECT_CORE_DURATION = 0.42
/** 碎片存活时间（秒） */
export const EFFECT_FRAGMENT_DURATION = 0.65
/** 烟团存活时间（秒） */
export const EFFECT_SMOKE_DURATION = 0.7
/** 非范围命中的闪光存活时间（秒） */
export const EFFECT_HIT_DURATION = 0.14
/** 每个特效槽位的碎片网格数 */
export const EFFECT_FRAGMENT_COUNT = 8
/** 每个特效槽位的烟团网格数 */
export const EFFECT_SMOKE_COUNT = 4
/** 火球起始半径 = 爆炸半径 × 该比例 */
export const EFFECT_CORE_START_RATIO = 0.22
/** 命中闪光半径 */
export const EFFECT_HIT_RADIUS = 0.16
/** 碎片水平抛撒速度 = 爆炸半径 × 该系数（再叠加随机） */
export const EFFECT_FRAGMENT_SPEED = 3.5
/** 烟团上浮速度 */
export const EFFECT_SMOKE_RISE = 0.6
/** 碎片粒子重力加速度（m/s²） */
export const EFFECT_GRAVITY = -9.82
/** 角色命中闪光沿「目标 → 弹丸」方向贴到表面时的最大偏移（m） */
export const EFFECT_IMPACT_SURFACE_OFFSET = 0.3
