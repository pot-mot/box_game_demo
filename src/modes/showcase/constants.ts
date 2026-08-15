import {COMBO_TILT_TABLE} from '../../character/state_machine/states/attacking.ts'

// ── 展示清单 ──

/** 展示角色清单条目：每个技能一个角色 */
export interface ShowcaseRosterEntry {
    readonly skillId: string
    readonly kind: 'melee' | 'ranged'
}

/**
 * 全部攻击技能的展示清单（6 近战 + 9 远程）。
 * skillId 必须与 MELEE_SKILL_PRESETS / RANGED_SKILL_PRESETS 的键一致。
 */
export const SHOWCASE_ROSTER: readonly ShowcaseRosterEntry[] = [
    {skillId: 'short_sword_slash', kind: 'melee'},
    {skillId: 'long_sword_slash', kind: 'melee'},
    {skillId: 'heavy_sword_slam', kind: 'melee'},
    {skillId: 'spear_thrust', kind: 'melee'},
    {skillId: 'dual_axe_spin', kind: 'melee'},
    {skillId: 'war_hammer_smash', kind: 'melee'},
    {skillId: 'longbow_shot', kind: 'ranged'},
    {skillId: 'crossbow_bolt', kind: 'ranged'},
    {skillId: 'shotgun_blast', kind: 'ranged'},
    {skillId: 'staff_orb', kind: 'ranged'},
    {skillId: 'magic_wand_homing', kind: 'ranged'},
    {skillId: 'throwing_axe_hurl', kind: 'ranged'},
    {skillId: 'grenade_throw', kind: 'ranged'},
    {skillId: 'molotov_throw', kind: 'ranged'},
    {skillId: 'throwing_dart_fling', kind: 'ranged'},
]

/** 技能中文名（键 = 技能 id） */
export const SKILL_DISPLAY_NAMES: Record<string, string> = {
    short_sword_slash: '短剑挥斩',
    long_sword_slash: '长剑挥斩',
    heavy_sword_slam: '巨剑重劈',
    spear_thrust: '长枪突刺',
    dual_axe_spin: '双斧旋斩',
    war_hammer_smash: '战锤猛砸',
    longbow_shot: '长弓射击',
    crossbow_bolt: '弩箭速射',
    shotgun_blast: '霰弹轰击',
    staff_orb: '法杖能量球',
    magic_wand_homing: '魔杖追踪弹',
    throwing_axe_hurl: '飞斧投掷',
    grenade_throw: '手雷投掷',
    molotov_throw: '燃烧瓶投掷',
    throwing_dart_fling: '飞镖疾掷',
}

/** 武器中文名（键 = 武器 id） */
export const WEAPON_DISPLAY_NAMES: Record<string, string> = {
    short_sword: '短剑',
    long_sword: '长剑',
    heavy_sword: '巨剑',
    spear: '长枪',
    dual_axe: '双斧',
    war_hammer: '战锤',
    longbow: '长弓',
    crossbow: '弩',
    shotgun: '霰弹枪',
    staff: '法杖',
    magic_wand: '魔杖',
    throwing_axe: '飞斧',
    grenade: '手雷',
    molotov: '燃烧瓶',
    throwing_dart: '飞镖',
}

/** 中文名查询：键缺失时回退原始 id（防御清单打错字） */
export const displayNameOf = (map: Record<string, string>, key: string): string =>
    key in map ? map[key] : key

// ── 连段时序 ──

/**
 * 连招倾斜角序列（rad）—— 直接引用生产状态机 attacking.ts 的源头常量并转出
 * （单一数据源，源头调整时此处自动跟随）。
 * 右上斜劈 → 左横斩 → 右横斩 → 近垂直竖劈，循环。
 */
export {COMBO_TILT_TABLE}

/** 近战连段演示总击数（= COMBO_TILT_TABLE 长度，逐个 tilt 各演示一击） */
export const TOTAL_COMBO_HITS = COMBO_TILT_TABLE.length

/**
 * 模拟玩家连打输入的触发点：进入 cancellable 阶段后达到此进度（0-1）即按住攻击键。
 * 取 0.5 兼顾两点——heavy_sword 的 cancellable 阶段是 windup（过早触发会把起手全吞掉），
 * 同时留足 comboTimer 余量（部分武器 recovery 后半程窗口已过期）。
 */
export const COMBO_INPUT_RATIO = 0.5

// ── 循环时间线（秒） ──

/** 循环起始待机时长（完整攻击展示前的缓冲） */
export const IDLE_LEAD = 1.0

/** 循环收尾待机时长（第 4 击播完后的缓冲） */
export const IDLE_TRAIL = 1.2

/** 段内推进失败（无可取消阶段/连招窗口过期）后、重新起手前的待机时长 */
export const RECOMBO_IDLE = 0.35

// ── 角色布局 ──

/** 近战行 Z 坐标（前排，靠近默认相机） */
export const MELEE_ROW_Z = 0

/** 近战行角色间距（m，需容纳挥砍半径） */
export const MELEE_SPACING = 3.0

/** 远程行 Z 坐标（后排） */
export const RANGED_ROW_Z = -4.5

/** 远程行角色间距（m） */
export const RANGED_SPACING = 2.4

/** 展示角色模型缩放（放大便于观察关节细节） */
export const ACTOR_SCALE = 1.3

/** 角色基础配置占位值（展示场景无物理，仅满足模型构造） */
export const ACTOR_SPEED = 6
export const ACTOR_JUMP_HEIGHT = 2

// ── 相机 ──

export const CAMERA_FOV = 55
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = 500

export const ORBIT_DEFAULT_TARGET_Y = 0.7
export const ORBIT_DEFAULT_TARGET_Z = -1.4
export const ORBIT_DEFAULT_DISTANCE = 13
export const ORBIT_DEFAULT_PITCH = 0.42
export const ORBIT_DEFAULT_YAW = 0
export const ORBIT_MIN_DISTANCE = 1.5
export const ORBIT_MAX_DISTANCE = 45
export const ORBIT_PITCH_MIN = 0.05
export const ORBIT_PITCH_MAX = 1.45

/** 未聚焦自由旋转的俯仰角范围（对标 edit 模式，可上下自由环视，留 0.01rad 防万向锁） */
export const FREE_PITCH_MIN = -Math.PI / 2 + 0.01
export const FREE_PITCH_MAX = Math.PI / 2 - 0.01

/** 旋转灵敏度（rad / px） */
export const ORBIT_ROTATE_SENSITIVITY = 0.005
/** 平移灵敏度（距离比例 / px） */
export const ORBIT_PAN_SENSITIVITY = 0.0016
/** 滚轮缩放指数系数 */
export const ORBIT_WHEEL_SENSITIVITY = 0.001
/** 聚焦时的观察距离 */
export const ORBIT_FOCUS_DISTANCE = 3.6
/** 聚焦/回归过渡速率（1/s，越大越快） */
export const ORBIT_FOCUS_LERP = 6

// ── 播放控制 ──

/** 单步一帧的模拟步长（秒）；帧时长限幅由主页单 RAF 的 MAX_DT 负责 */
export const STEP_DT = 1 / 60

/** 播放速度档位 */
export const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1] as const

// ── 头顶名称标签 ──

/** 标签画布尺寸（px） */
export const LABEL_CANVAS_W = 512
export const LABEL_CANVAS_H = 160

/** 标签世界尺寸（m） */
export const LABEL_WORLD_W = 1.05
export const LABEL_WORLD_H = 0.33

/** 标签相对角色锚点的高度（m，已按 ACTOR_SCALE 放大后的模型头顶上方） */
export const LABEL_HEIGHT = 1.75

// ── 场景外观 ──

/** 场景背景色（深蓝灰，衬托网格与角色） */
export const SCENE_BACKGROUND = 0x14161c

/** 聚焦高亮环内/外半径（m） */
export const FOCUS_RING_INNER = 0.55
export const FOCUS_RING_OUTER = 0.72

/** 聚焦高亮环颜色（暖金，与刀光呼应） */
export const FOCUS_RING_COLOR = 0xffd070

/** 聚焦环呼吸动画频率（Hz） */
export const FOCUS_RING_PULSE_FREQ = 3

/** 非聚焦角色的材质透明度（变暗观察） */
export const DIMMED_OPACITY = 0.22

/** 判定为"点击拾取"的最大按下位移（px，超过视为拖拽旋转） */
export const CLICK_SLOP_PX = 5
