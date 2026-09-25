// ── 展示清单 ──

/** 展示角色清单条目：近战按武器（每武器一个角色播完整双链）、远程按技能 */
export interface ShowcaseRosterEntry {
    /** 近战 = 武器 id（MELEE_WEAPON_PRESETS 键），远程 = 技能 id（RANGED_SKILL_PRESETS 键） */
    readonly skillId: string
    readonly kind: 'melee' | 'ranged'
}

/**
 * 全部攻击技能的展示清单（6 近战武器 + 9 远程技能）。
 * 近战每武器一个角色播完整双链（轻1→轻2 → 停顿 → 重1→重2）。
 */
export const SHOWCASE_ROSTER: readonly ShowcaseRosterEntry[] = [
    {skillId: 'short_sword', kind: 'melee'},
    {skillId: 'long_sword', kind: 'melee'},
    {skillId: 'heavy_sword', kind: 'melee'},
    {skillId: 'spear', kind: 'melee'},
    {skillId: 'dual_axe', kind: 'melee'},
    {skillId: 'war_hammer', kind: 'melee'},
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

/** 技能中文名（近战键 = 武器 id，远程键 = 技能 id）；武器中文名取自武器预设的 `name` 字段 */
export const SKILL_DISPLAY_NAMES: Record<string, string> = {
    short_sword: '短剑轻/重双链',
    long_sword: '长剑轻/重双链',
    heavy_sword: '巨剑轻/重双链',
    spear: '长枪轻/重双链',
    dual_axe: '双斧轻/重双链',
    war_hammer: '战锤轻/重双链',
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

/** 链内段停顿序号：轻链播完后插入停顿再接重链（script 下标，仅近战生效） */
export const CHAIN_PAUSE_AFTER_POS = 1

// ── 循环时间线（秒） ──

/** 循环起始待机时长（完整攻击展示前的缓冲） */
export const IDLE_LEAD = 1.0

/** 循环收尾待机时长（重链播完后的缓冲） */
export const IDLE_TRAIL = 1.2

/** 轻链与重链之间的停顿时长（模拟玩家松开攻击键） */
export const CHAIN_PAUSE_IDLE = 0.6

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
