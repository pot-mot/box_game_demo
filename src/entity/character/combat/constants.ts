/** 近战武器物理尺寸 */
export const WEAPON_WIDTH = 0.35
export const WEAPON_HEIGHT = 0.35
export const WEAPON_LENGTH = 1.6
export const WEAPON_COLLISION_GROUP = 16
export const WEAPON_COLLISION_MASK = 1

/** 投掷物 */
export const BULLET_COLLISION_GROUP = 8
export const BULLET_COLLISION_MASK = 0
/** 子弹命中检测半径（需覆盖角色碰撞半径 + 一帧内子弹移动距离） */
export const BULLET_HIT_RADIUS = 1.2
export const BULLET_SIZE = 0.1

/** 近战命中顿帧：持续时间（秒，真实时间） */
export const HITSTOP_DURATION = 0.07

/** 近战命中顿帧：时间缩放（角色子系统 dt 乘数，趋近 0 = 冻结） */
export const HITSTOP_TIMESCALE = 0.05

/** 近战攻击检测回退深度（m，scale=1）：AI checker 缺失时的圆形距离判定默认值（检测箱本体由武器 detectBox 配置驱动） */
export const MELEE_FALLBACK_DETECT_RANGE = 1.5

/* ── 近战出招检测箱（detectBox）估算 ──
 * detectBox 不在运行时推导，而是按以下常量离线估算后写入武器类配置（`melee_weapon.ts`），
 * 并由 `detect_box.test.ts` 锁定：detectBox = 估算攻击范围盒 + 每轴 MELEE_DETECT_MARGIN。
 * 详见 `docs/ai_system.md` 2.5。
 */

/** 持械臂完全前伸时的前伸量（m，scale=1）：上臂 + 前臂（bodyH = 0.36）+ 躯干前侧 / 刺击探身余量 */
export const MELEE_ARM_FORWARD_REACH = 0.5
/** 估算范围：相对身体碰撞箱的水平外扩半长（侧向覆盖） */
export const MELEE_DETECT_SIDE_MARGIN = 0.1
/** 估算范围：相对身体碰撞箱的竖直外扩半高 */
export const MELEE_DETECT_HEIGHT_MARGIN = 0.05
/** 估算范围：向身后延伸量（覆盖贴背目标） */
export const MELEE_DETECT_BACK_MARGIN = 0.1
/** detectBox 相对估算攻击范围盒的每轴外扩余量（+0.05，让 AI 在将将够到时即可出招） */
export const MELEE_DETECT_MARGIN = 0.05
/** 前向探测收缩系数：detectBox 在朝向（前方）方向的探测距离 = 估算前伸 × 该系数，
 *  收短以避免 AI 对过远目标提前出招（横向 / 竖直 / 身后不变） */
export const MELEE_DETECT_FORWARD_SCALE = 0.8
