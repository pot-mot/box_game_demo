import type {HoldMode} from '../../character/weapon/hold_mode.ts'
import type {LimbSlot} from '../../character/armor/slots.ts'
import type {ArmorSlot} from '../../character/armor/slots.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'

// ── 展示清单 ──

/** 展示角色清单条目：按武器 id + 持握模式指定（近战三模式分开展示；远程用默认模式） */
export interface ShowcaseRosterEntry {
    /** 武器 id（`WeaponConfig.id`，近战与远程统一；经 `weaponPresetOrDefault` 取模组） */
    readonly skillId: string
    readonly kind: 'melee' | 'ranged'
    /** 近战持握模式（单持 / 双手共持 / 双持）；远程缺省 = 武器默认模式 */
    readonly holdMode?: HoldMode
}

const MELEE_IDS = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer'] as const

/**
 * 全部展示武器的清单：
 * - 近战 6 武器 × 3 持握模式 = 18 角色（按模式分三排：单持 / 双手共持 / 双持），
 *   每角色按该模式连段循环播放（轻链 → 停顿 → 重链）；
 * - 远程 9 武器（单段开火动作）。
 */
export const SHOWCASE_ROSTER: readonly ShowcaseRosterEntry[] = [
    ...MELEE_IDS.map(skillId => ({skillId, kind: 'melee', holdMode: 'one_handed'} as const)),
    ...MELEE_IDS.map(skillId => ({skillId, kind: 'melee', holdMode: 'two_handed'} as const)),
    ...MELEE_IDS.map(skillId => ({skillId, kind: 'melee', holdMode: 'dual_wield'} as const)),
    {skillId: 'longbow', kind: 'ranged'},
    {skillId: 'crossbow', kind: 'ranged'},
    {skillId: 'shotgun', kind: 'ranged'},
    {skillId: 'staff', kind: 'ranged'},
    {skillId: 'magic_wand', kind: 'ranged'},
    {skillId: 'throwing_axe', kind: 'ranged'},
    {skillId: 'grenade', kind: 'ranged'},
    {skillId: 'molotov', kind: 'ranged'},
    {skillId: 'throwing_dart', kind: 'ranged'},
]

// ── 循环时间线（秒） ──

/** 循环起始待机时长（完整攻击展示前的缓冲） */
export const IDLE_LEAD = 1.0

/** 循环收尾待机时长（重链播完后的缓冲） */
export const IDLE_TRAIL = 1.2

/** 轻链与重链之间的停顿时长（模拟玩家松开攻击键） */
export const CHAIN_PAUSE_IDLE = 0.6

/** 近战重击前的「满蓄力前置表现」保持时长（秒）：先定格满蓄力姿势再出招，便于观察蓄力动作 */
export const CHARGE_HOLD_DURATION = 1.0

// ── 角色布局 ──

/** 近战单持排 Z 坐标（前排，靠近默认相机） */
export const MELEE_ROW_Z = 0

/** 近战排间距（m）：单持 → 双手共持 → 双持依次向后 */
export const MELEE_ROW_SPACING = 3.4

/** 近战行角色间距（m，需容纳挥砍半径） */
export const MELEE_SPACING = 3.0

/** 远程行 Z 坐标（最后一排） */
export const RANGED_ROW_Z = MELEE_ROW_Z - MELEE_ROW_SPACING * 3

/** 远程行角色间距（m） */
export const RANGED_SPACING = 2.4

// ── 种族 / 套装展示清单 ──

/**
 * 种族展示条目：装备四槽同种族肢体（默认 replace，完整替换为骷髅 / 兽人 / 精灵），
 * 站立行走各 2s 交替循环。
 */
export interface RaceShowcaseEntry {
    kind: 'race'
    /** 肢体槽位 → 肢体 id（`LIMB_PRESETS`） */
    limb: Readonly<Partial<Record<LimbSlot, string>>>
    /** 护甲槽位 → 护甲 id；缺省 = 不穿护甲 */
    armor?: Readonly<Partial<Record<ArmorSlot, string>>>
    /** 展示名文案键（面板 / 头顶标签，经 `translate` 解析） */
    name: StringLocaleKey
    faction: number
}

/** 套装展示条目：装备成套护甲 + 人类肢体，站立行走各 2s 交替循环 */
export interface ArmorSetShowcaseEntry {
    kind: 'armor_set'
    /** 护甲槽位 → 护甲 id（`ARMOR_PRESETS`） */
    armor: Readonly<Partial<Record<ArmorSlot, string>>>
    /** 肢体槽位 → 肢体 id；缺省 = 人类肢体（套装展示用） */
    limb?: Readonly<Partial<Record<LimbSlot, string>>>
    /** 展示名文案键（面板 / 头顶标签，经 `translate` 解析） */
    name: StringLocaleKey
    faction: number
}

export type ShowcaseExtraEntry = RaceShowcaseEntry | ArmorSetShowcaseEntry

/**
 * 种族 / 套装展示清单（独立于武器攻击清单的额外一排）：
 * - 三族各自装备四槽同种族肢体（骷髅 / 兽人 / 精灵），并各自使用独立阵营（颜色随阵营调色板变化）；
 * - 三套护甲套装（铁甲 / 法袍 / 疾风皮甲）装备人类肢体，展示成套装束。
 * - 阵营号与人类行使用**同一映射**（`factionColorOf`）：0 红 / 1 蓝 / 2 绿 / 3 黄 / 4 粉 / 5 灰，
 *   因此同号阵营的种族与人类上色完全一致。
 */
export const RACE_SHOWCASE_ROSTER: readonly ShowcaseExtraEntry[] = [
    {
        kind: 'race', name: 'showcase.race.skeleton',
        limb: {head: 'skeleton_head', arms: 'skeleton_arms', body: 'skeleton_body', legs: 'skeleton_legs'},
        faction: 0,
    },
    {
        kind: 'race', name: 'showcase.race.orc',
        limb: {head: 'orc_head', arms: 'orc_arms', body: 'orc_body', legs: 'orc_legs'},
        faction: 1,
    },
    {
        kind: 'race', name: 'showcase.race.elf',
        limb: {head: 'elf_head', arms: 'elf_arms', body: 'elf_body', legs: 'elf_legs'},
        faction: 2,
    },
    {
        kind: 'armor_set', name: 'showcase.armor_set.iron',
        armor: {head: 'iron_helmet', chest: 'iron_plate', arms: 'iron_bracers', legs: 'iron_greaves'},
        faction: 3,
    },
    {
        kind: 'armor_set', name: 'showcase.armor_set.mage',
        armor: {head: 'mage_hood', chest: 'mage_robe', arms: 'mage_wraps', legs: 'mage_leggings'},
        faction: 4,
    },
    {
        kind: 'armor_set', name: 'showcase.armor_set.wind',
        armor: {head: 'cloth_cap', chest: 'leather_armor', arms: 'cloth_bracers', legs: 'wind_boots'},
        faction: 5,
    },
]

/**
 * 体形展示条目：非人形体形（狼 / 马 / 双足飞龙 wyvern）——循环播放对应体形的 idle ↔ walking 动画。
 * 名称文案键取自体形计划（`body_form.*`），副名为「体形」。
 */
export interface CreatureShowcaseEntry {
    /** 体形 id（`BodyForm.id`） */
    readonly bodyFormId: string
    /** 展示名文案键（面板 / 头顶标签，经 `translate` 解析） */
    readonly name: StringLocaleKey
}

export const CREATURE_SHOWCASE_ROSTER: readonly CreatureShowcaseEntry[] = [
    {bodyFormId: 'wolf', name: 'body_form.wolf'},
    {bodyFormId: 'horse', name: 'body_form.horse'},
    {bodyFormId: 'wyvern', name: 'body_form.wyvern'},
]

/** 外观图鉴：整套护甲展示条目（以整套为整体预览，不单件展示） */
export interface ArmorSetShowcase {
    /** 整套名文案键 */
    readonly nameKey: StringLocaleKey
    /** 四槽护甲 id（head / chest / arms / legs） */
    readonly armor: Readonly<Partial<Record<ArmorSlot, string>>>
    readonly faction: number
}

/** 整套护甲展示清单（布 / 皮 / 铁 / 鳞 / 石 / 法师，各自完整成套） */
export const ARMOR_SET_SHOWCASE: readonly ArmorSetShowcase[] = [
    {nameKey: 'showcase.set.cloth', armor: {head: 'cloth_cap', chest: 'cloth_vest', arms: 'cloth_bracers', legs: 'cloth_pants'}, faction: 3},
    {nameKey: 'showcase.set.leather', armor: {head: 'leather_cap', chest: 'leather_armor', arms: 'leather_bracers', legs: 'leather_legs'}, faction: 4},
    {nameKey: 'showcase.set.iron', armor: {head: 'iron_helmet', chest: 'iron_plate', arms: 'iron_bracers', legs: 'iron_greaves'}, faction: 5},
    {nameKey: 'showcase.set.scale', armor: {head: 'scale_helm', chest: 'scale_mail', arms: 'scale_bracers', legs: 'scale_legs'}, faction: 0},
    {nameKey: 'showcase.set.stone', armor: {head: 'stone_helm', chest: 'stone_plate', arms: 'stone_bracers', legs: 'stone_legs'}, faction: 1},
    {nameKey: 'showcase.set.mage', armor: {head: 'mage_hood', chest: 'mage_robe', arms: 'mage_wraps', legs: 'mage_leggings'}, faction: 2},
]

/** 外观图鉴行角色间距（m） */
export const SHOWCASE_APPEARANCE_SPACING = 3.0
/** 外观图鉴行间距（m） */
export const SHOWCASE_APPEARANCE_ROW_SPACING = 3.4

/** 站立 / 行走各持续时长（秒）：到达即切换到另一姿态并循环 */
export const RACE_SHOWCASE_HOLD_SECONDS = 2.0

/** 展示角色模型缩放（放大便于观察关节细节） */
export const ACTOR_SCALE = 1.3

/** 角色基础配置占位值（展示场景无物理，仅满足模型构造） */
export const ACTOR_SPEED = 6
export const ACTOR_JUMP_HEIGHT = 2

// ── 相机 ──

export const CAMERA_FOV = 55
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = 500

/* 轨道相机的默认球坐标 / 灵敏度等常量已迁至 `modes/control/constants.ts`（纯摄像机与玩家主控共用） */

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

// ── AI 行为 × 复杂地形展示 ──

/** 地形网格边长（格点数）；实际尺寸 = 格点数 × 格边长 */
export const AI_TERRAIN_GRID_SIZE = 24
/** 地形格边长（m） */
export const AI_TERRAIN_CELL_SIZE = 2
/** 地形最低 / 最高高度（m） */
export const AI_TERRAIN_MIN_HEIGHT = 0
export const AI_TERRAIN_MAX_HEIGHT = 5
/** 地形地面摩擦 */
export const AI_TERRAIN_FRICTION = 0.3
/** 地形生成器 id（`GENERATORS`） */
export const AI_TERRAIN_GENERATOR = 'fbm'

/** 双方出生点 X 坐标（沿 X 轴对置） */
export const AI_TEAM_SPAWN_X = 7
/** 同性阵营单位沿 Z 轴间距（m） */
export const AI_TEAM_SPAWN_Z_SPAN = 3
/** AI 角色基础移速（m/s） */
export const AI_CHARACTER_SPEED = 3.2
/** AI 角色跳跃高度（m） */
export const AI_CHARACTER_JUMP_HEIGHT = 2
/** AI 角色最大生命 */
export const AI_CHARACTER_MAX_HEALTH = 60

/** 中央低墙（跳跃演示）厚度（X）/ 高度（Y）/ 长度（Z） */
export const AI_OBSTACLE_WALL_THICKNESS = 0.6
export const AI_OBSTACLE_WALL_HEIGHT = 0.8
export const AI_OBSTACLE_WALL_DEPTH = 20

/** AI 状态 HUD 刷新间隔（秒） */
export const AI_HUD_REFRESH_INTERVAL = 0.2
/** 相机观察 AI 战场的默认距离（m）与目标高度（m） */
export const AI_CAMERA_DISTANCE = 24
export const AI_CAMERA_TARGET_Y = 2

// ── 全物品图鉴展示 ──

/** 图鉴展示人体的相机注视目标高度（m） */
export const CATALOG_CAMERA_TARGET_Y = 0.95

/** 图鉴默认自由飞行视角的观察距离（m，把展示人体置于画面中央，可用 WASDZX 自由环绕） */
export const CATALOG_CAMERA_DISTANCE = 4.5

/** 图鉴方块预览的中心高度（m） */
export const CATALOG_CUBE_Y = 0.7

// ── 背包格子交互展示 ──

/** 演示背包尺寸（格）；需容纳全物品清单 */
export const SHOWCASE_INVENTORY_WIDTH = 12
export const SHOWCASE_INVENTORY_HEIGHT = 10

/** 演示箱子摆放 Z 坐标（X = 0，玩家自 +Z 面向 -Z 走向它） */
export const INVENTORY_CHEST_Z = 0

/** 背包模块相机默认距离（m）与跟随目标高度（m） */
export const INVENTORY_CAMERA_DISTANCE = 10
export const INVENTORY_CAMERA_TARGET_Y = 1.4

// ── 交互物交互效果展示 ──

/** 交互物摆放行 Z 坐标与间距（m） */
export const INTERACTABLE_ROW_Z = 0
export const INTERACTABLE_SPACING = 3.2

/** 交互物展示相机默认距离（m）与跟随目标高度（m） */
export const INTERACTABLE_CAMERA_DISTANCE = 12
export const INTERACTABLE_CAMERA_TARGET_Y = 1.4

/** 交互物演示的简化玩家：基础移速 / 跳跃高度 / 出生 Z 坐标 / 死亡重生延时（秒） */
export const PLAYER_SPEED = 3.5
export const PLAYER_JUMP_HEIGHT = 2
export const PLAYER_SPAWN_Z = 3.5
export const INTERACTABLE_RESPAWN_DELAY = 2.5

// ── 复杂地形与建筑展示 ──

/** 地形网格边长（格点数）与格边长（m） */
export const TERRAIN_GRID_SIZE = 32
export const TERRAIN_CELL_SIZE = 3
/** 地形最低 / 最高高度（m）与摩擦 */
export const TERRAIN_MIN_HEIGHT = 0
export const TERRAIN_MAX_HEIGHT = 4
export const TERRAIN_FRICTION = 0.3
/** 默认地形生成器与可切换生成器列表 */
export const TERRAIN_DEFAULT_GENERATOR = 'fbm'
export const TERRAIN_GENERATORS = ['fbm', 'sine', 'steps', 'flat'] as const

/** 建筑摆放网格：列数与行列间距（m） */
export const BUILDING_GRID_COLUMNS = 4
export const BUILDING_GRID_SPACING = 18

/** 地形 / 建筑展示相机默认距离（m）与目标高度（m） */
export const TERRAIN_CAMERA_DISTANCE = 42
export const TERRAIN_CAMERA_TARGET_Y = 3
