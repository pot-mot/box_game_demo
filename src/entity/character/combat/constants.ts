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

/** 攻击检测箱相对身体碰撞箱的水平外扩边距（半长增量，覆盖侧面） */
export const ATTACK_DETECT_SIDE_MARGIN = 0.1
/** 攻击检测箱相对身体碰撞箱的竖直外扩边距（半高增量） */
export const ATTACK_DETECT_HEIGHT_MARGIN = 0.05
/** 攻击检测箱向身后延伸量（覆盖贴背目标） */
export const ATTACK_DETECT_BACK_MARGIN = 0.1
/** 持械臂完全前伸时的前伸量（m，scale=1）：上臂+前臂（bodyH=0.36）+ 躯干前侧/刺击探身余量，
 * 与武器命中箱 reach 叠加得到武器打击部位距身体中心的实际最远距离 */
export const MELEE_ARM_FORWARD_REACH = 0.5
/** 攻击检测箱相对武器实际打击距离的前向触发余量（让 AI 在将将够到时即出招，挥砍前摇内可步入命中区） */
export const ATTACK_DETECT_REACH_MARGIN = 0.15
