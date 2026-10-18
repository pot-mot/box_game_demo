/**
 * 展示模式文案域。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `showcaseZh`、英文表 `showcaseEn` 必须结构一致。
 */
export type ShowcaseLocale = {
    /* ── 二级菜单 ── */
    'showcase.menu.title': string
    'showcase.menu.subtitle': string
    'showcase.back_menu': string
    'showcase.module.actions.title': string
    'showcase.module.actions.desc': string
    'showcase.module.appearance.title': string
    'showcase.module.appearance.desc': string
    'showcase.module.ai_terrain.title': string
    'showcase.module.ai_terrain.desc': string
    'showcase.module.terrain.title': string
    'showcase.module.terrain.desc': string
    'showcase.module.interactables.title': string
    'showcase.module.interactables.desc': string
    'showcase.module.catalog.title': string
    'showcase.module.catalog.desc': string
    'showcase.module.inventory.title': string
    'showcase.module.inventory.desc': string

    /* ── 主面板 ── */
    'showcase.title': string
    'showcase.subtitle': string
    'showcase.pause': string
    'showcase.resume': string
    'showcase.step': string
    'showcase.focus_none': string
    'showcase.unfocus': string
    'showcase.total_progress': string
    'showcase.timer.action': string
    'showcase.timer.recovery': string
    'showcase.timer.cooldown': string

    /* ── 角色状态（列表行） ── */
    'showcase.status.idle': string
    'showcase.status.blocking': string
    'showcase.status.charging': string
    'showcase.status.shooting': string
    'showcase.status.stand_walk': string
    'showcase.status.hit': (current: number, total: number) => string

    /* ── 聚焦详情卡 ── */
    'showcase.detail.status_idle': string
    'showcase.detail.status_blocking': string
    'showcase.detail.status_charging': string
    'showcase.detail.combo': (current: number, total: number) => string
    'showcase.detail.ranged': string
    'showcase.detail.phase_none': string
    'showcase.detail.phase_charging': string
    'showcase.detail.phase_done': (percent: string) => string
    'showcase.detail.phase_running': (name: string, percent: string) => string
    'showcase.detail.link_none': string
    'showcase.detail.link_charging': string
    'showcase.detail.link': (link: string) => string

    /* ── 连段衔接方式（`LINK_LABELS`） ── */
    'showcase.link.first': string
    'showcase.link.advance': string
    'showcase.link.restart': string
    'showcase.link.none': string

    /* ── 头顶标签副名 ── */
    'showcase.weapon.melee_subtitle': (hold: string) => string
    'showcase.weapon.ranged': string
    'showcase.extra.race_limb': string
    'showcase.extra.armor_set': string
    'showcase.extra.body_form': string
    /* ── 攻击模组展示 Tab / 调试开关 ── */
    'showcase.tab.humanoid': string
    'showcase.tab.wyvern': string
    'showcase.tab.horse': string
    'showcase.tab.wolf': string
    'showcase.debug.title': string
    'showcase.debug.collision': string
    'showcase.debug.hurt': string
    'showcase.debug.attack': string

    /* ── 种族 / 套装展示名（`constants.ts` 的本地常量） ── */
    'showcase.race.skeleton': string
    'showcase.race.orc': string
    'showcase.race.elf': string
    'showcase.armor_set.iron': string
    'showcase.armor_set.mage': string
    'showcase.armor_set.wind': string
    /* ── 整套护甲展示名（外观图鉴以整套预览） ── */
    'showcase.set.cloth': string
    'showcase.set.leather': string
    'showcase.set.iron': string
    'showcase.set.scale': string
    'showcase.set.stone': string
    'showcase.set.mage': string

    /* ── 外观图鉴 ── */
    'showcase.appearance.armor_stat': (slot: string, physical: string, magic: string, speed: string) => string

    /* ── AI 行为 × 复杂地形 ── */
    'showcase.ai.title': string
    'showcase.ai.subtitle': string
    'showcase.ai.reset': string

    /* ── 复杂地形与建筑 ── */
    'showcase.terrain.title': string
    'showcase.terrain.subtitle': string
    'showcase.terrain.generator': string
    'showcase.terrain.reseed': string
    'showcase.terrain.recipes': string

    /* ── 交互物交互效果 ── */
    'showcase.interact.title': string
    'showcase.interact.subtitle': string
    'showcase.interact.activate': string
    'showcase.interact.kill': string
    'showcase.interact.reset': string
    'showcase.interact.hint': string
    'showcase.interact.controls': string
    'showcase.interact.event_save': string
    'showcase.interact.event_teleport': string

    /* ── 背包与格子交互 ── */
    'showcase.inventory.controls': string
    'showcase.inventory.hint': string
    'showcase.inventory.open': string
    'showcase.inventory.event_chest': string

    /* ── 全物品图鉴 ── */
    'showcase.catalog.title': string
    'showcase.catalog.subtitle': string
    'showcase.catalog.hint': string
    'showcase.catalog.all': string
}

export const showcaseZh: ShowcaseLocale = {
    /* ── 二级菜单 ── */
    'showcase.menu.title': '展示模式',
    'showcase.menu.subtitle': '选择要展示的子系统',
    'showcase.back_menu': '返回展示菜单',
    'showcase.module.actions.title': '攻击模组展示',
    'showcase.module.actions.desc': '全武器攻击动作 / 连段 / 蓄力与持握模式时序复现',
    'showcase.module.appearance.title': '装备与外观',
    'showcase.module.appearance.desc': '种族肢体与全护甲件图鉴（站立 / 行走）',
    'showcase.module.ai_terrain.title': 'AI 与复杂地形',
    'showcase.module.ai_terrain.desc': '双阵营 AI 在起伏地形中的寻路 / 跳跃 / 索敌攻击',
    'showcase.module.terrain.title': '复杂地形与建筑',
    'showcase.module.terrain.desc': 'FBM 起伏地形 + 全部建筑配方（可切换生成器 / 随机重建）',
    'showcase.module.interactables.title': '交互物',
    'showcase.module.interactables.desc': '7 类交互物：门 / 闸门 / 升降梯 / 开关 / 传送 / 存档',
    'showcase.module.catalog.title': '全物品图鉴',
    'showcase.module.catalog.desc': '全物品与装备清单预览（含模型装配）',
    'showcase.module.inventory.title': '背包与格子交互',
    'showcase.module.inventory.desc': '俄罗斯方块背包交互 + 可操作玩家走近开箱',

    /* ── 主面板 ── */
    'showcase.title': '攻击动作展示台',
    'showcase.subtitle': '全武器攻击阶段动画 · 连段衔接时序复现',
    'showcase.pause': '暂停',
    'showcase.resume': '继续',
    'showcase.step': '⏭ 单步',
    'showcase.focus_none': '聚焦：无',
    'showcase.unfocus': '取消聚焦',
    'showcase.total_progress': '攻击总进度',
    'showcase.timer.action': '动作',
    'showcase.timer.recovery': '恢复',
    'showcase.timer.cooldown': '冷却',

    /* ── 角色状态（列表行） ── */
    'showcase.status.idle': '待机',
    'showcase.status.blocking': '格挡',
    'showcase.status.charging': '蓄力',
    'showcase.status.shooting': '射击',
    'showcase.status.stand_walk': '站立/行走',
    'showcase.status.hit': (current, total) => `击${current}/${total}`,

    /* ── 聚焦详情卡 ── */
    'showcase.detail.status_idle': '状态：待机',
    'showcase.detail.status_blocking': '状态：格挡（举盾）',
    'showcase.detail.status_charging': '状态：满蓄力前置',
    'showcase.detail.combo': (current, total) => `连段第 ${current}/${total} 击`,
    'showcase.detail.ranged': '远程射击序列',
    'showcase.detail.phase_none': '阶段：—',
    'showcase.detail.phase_charging': '阶段：满蓄力姿势定格',
    'showcase.detail.phase_done': (percent) => `阶段：收势(全部阶段完成) · ${percent}%`,
    'showcase.detail.phase_running': (name, percent) => `阶段：${name} · ${percent}%`,
    'showcase.detail.link_none': '衔接：—',
    'showcase.detail.link_charging': '衔接：蓄力 → 出招',
    'showcase.detail.link': (link) => `衔接：${link}`,

    /* ── 连段衔接方式（`LINK_LABELS`） ── */
    'showcase.link.first': '首次起手',
    'showcase.link.advance': '段内推进',
    'showcase.link.restart': '重新起手',
    'showcase.link.none': '—',

    /* ── 头顶标签副名 ── */
    'showcase.weapon.melee_subtitle': (hold) => `近战 · ${hold}`,
    'showcase.weapon.ranged': '远程武器',
    'showcase.extra.race_limb': '种族肢体',
    'showcase.extra.armor_set': '护甲套装',
    'showcase.extra.body_form': '体形',
    'showcase.tab.humanoid': '人',
    'showcase.tab.wyvern': '龙',
    'showcase.tab.horse': '马',
    'showcase.tab.wolf': '狼',
    'showcase.debug.title': '调试：',
    'showcase.debug.collision': '碰撞箱',
    'showcase.debug.hurt': '受击箱',
    'showcase.debug.attack': '攻击箱',

    /* ── 种族 / 套装展示名（`constants.ts` 的本地常量） ── */
    'showcase.race.skeleton': '骷髅',
    'showcase.race.orc': '兽人',
    'showcase.race.elf': '精灵',
    'showcase.armor_set.iron': '铁甲套装',
    'showcase.armor_set.mage': '法袍套装',
    'showcase.armor_set.wind': '疾风皮甲',
    'showcase.set.cloth': '布衣套装',
    'showcase.set.leather': '皮甲套装',
    'showcase.set.iron': '铁甲套装',
    'showcase.set.scale': '鳞甲套装',
    'showcase.set.stone': '石甲套装',
    'showcase.set.mage': '法师套装',

    /* ── 外观图鉴 ── */
    'showcase.appearance.armor_stat': (slot, physical, magic, speed) => `${slot} · 物防${physical} 魔防${magic} 速${speed}`,

    /* ── AI 行为 × 复杂地形 ── */
    'showcase.ai.title': 'AI 行为 × 复杂地形',
    'showcase.ai.subtitle': '红蓝双阵营互相敌对 · 寻路 / 跳跃 / 索敌攻击',
    'showcase.ai.reset': '重开战斗',

    /* ── 复杂地形与建筑 ── */
    'showcase.terrain.title': '复杂地形与建筑',
    'showcase.terrain.subtitle': '切换地形生成器 / 随机重建，观察全部建筑配方',
    'showcase.terrain.generator': '地形生成器',
    'showcase.terrain.reseed': '随机重建',
    'showcase.terrain.recipes': '建筑配方',

    /* ── 交互物交互效果 ── */
    'showcase.interact.title': '交互物交互效果',
    'showcase.interact.subtitle': '点击激活；开关联动同频道的门 / 闸门 / 升降梯',
    'showcase.interact.activate': '激活',
    'showcase.interact.kill': '击杀玩家',
    'showcase.interact.reset': '重置',
    'showcase.interact.hint': '点击左侧交互物「激活」查看效果',
    'showcase.interact.controls': '操作：WASD 移动 · 空格 跳跃 · Shift 翻滚 · F 交互 · K 击杀（相机跟随玩家，鼠标拖拽环绕）',
    'showcase.interact.event_save': '存档点已点燃',
    'showcase.interact.event_teleport': '已触发传送',

    /* ── 背包与格子交互 ── */
    'showcase.inventory.controls': '操作：WASD 移动 · 空格 跳跃 · Shift 翻滚 · F 交互 · Tab 开关背包（相机跟随玩家，鼠标拖拽环绕）',
    'showcase.inventory.hint': '按 Tab 开关背包；走近箱子按 F 打开容器存取物品',
    'showcase.inventory.open': '打开背包',
    'showcase.inventory.event_chest': '已打开箱子',

    /* ── 全物品图鉴 ── */
    'showcase.catalog.title': '全物品图鉴',
    'showcase.catalog.subtitle': '点击格子预览物品外观（装备 / 方块）',
    'showcase.catalog.hint': '选择格子查看物品详情与外观',
    'showcase.catalog.all': '全部',
}

export const showcaseEn: ShowcaseLocale = {
    /* ── Sub-menu ── */
    'showcase.menu.title': 'Showcase',
    'showcase.menu.subtitle': 'Select a subsystem to display',
    'showcase.back_menu': 'Back to menu',
    'showcase.module.actions.title': 'Attack Modules',
    'showcase.module.actions.desc': 'All-weapon attack actions / combos / charge and hold-mode timing',
    'showcase.module.appearance.title': 'Equipment & Look',
    'showcase.module.appearance.desc': 'Race limbs and full armor-piece codex (stand / walk)',
    'showcase.module.ai_terrain.title': 'AI & Terrain',
    'showcase.module.ai_terrain.desc': 'Two factions pathfinding / jumping / engaging over rolling terrain',
    'showcase.module.terrain.title': 'Terrain & Buildings',
    'showcase.module.terrain.desc': 'FBM rolling terrain + all building recipes (switch generator / reseed)',
    'showcase.module.interactables.title': 'Interactables',
    'showcase.module.interactables.desc': '7 kinds: doors / gate / elevator / switch / teleport / save',
    'showcase.module.catalog.title': 'Item Codex',
    'showcase.module.catalog.desc': 'All items and equipment with model preview',
    'showcase.module.inventory.title': 'Inventory Grid',
    'showcase.module.inventory.desc': 'Tetris inventory interactions + a controllable player to open a chest',

    /* ── Main panel ── */
    'showcase.title': 'Attack Showcase',
    'showcase.subtitle': 'All-weapon attack phase animation · combo timing reproduction',
    'showcase.pause': 'Pause',
    'showcase.resume': 'Resume',
    'showcase.step': '⏭ Step',
    'showcase.focus_none': 'Focus: None',
    'showcase.unfocus': 'Unfocus',
    'showcase.total_progress': 'Total Attack Progress',
    'showcase.timer.action': 'Action',
    'showcase.timer.recovery': 'Recovery',
    'showcase.timer.cooldown': 'Cooldown',

    /* ── Actor status (list rows) ── */
    'showcase.status.idle': 'Idle',
    'showcase.status.blocking': 'Block',
    'showcase.status.charging': 'Charging',
    'showcase.status.shooting': 'Shooting',
    'showcase.status.stand_walk': 'Stand/Walk',
    'showcase.status.hit': (current, total) => `Hit ${current}/${total}`,

    /* ── Focus detail card ── */
    'showcase.detail.status_idle': 'Status: Idle',
    'showcase.detail.status_blocking': 'Status: Blocking',
    'showcase.detail.status_charging': 'Status: Full-charge stance',
    'showcase.detail.combo': (current, total) => `Combo hit ${current}/${total}`,
    'showcase.detail.ranged': 'Ranged fire sequence',
    'showcase.detail.phase_none': 'Phase: —',
    'showcase.detail.phase_charging': 'Phase: full-charge pose held',
    'showcase.detail.phase_done': (percent) => `Phase: settle (all phases done) · ${percent}%`,
    'showcase.detail.phase_running': (name, percent) => `Phase: ${name} · ${percent}%`,
    'showcase.detail.link_none': 'Link: —',
    'showcase.detail.link_charging': 'Link: charge → strike',
    'showcase.detail.link': (link) => `Link: ${link}`,

    /* ── Combo link modes (`LINK_LABELS`) ── */
    'showcase.link.first': 'First opener',
    'showcase.link.advance': 'Segment advance',
    'showcase.link.restart': 'Restart opener',
    'showcase.link.none': '—',

    /* ── Name label subtitle ── */
    'showcase.weapon.melee_subtitle': (hold) => `Melee · ${hold}`,
    'showcase.weapon.ranged': 'Ranged Weapon',
    'showcase.extra.race_limb': 'Race Limbs',
    'showcase.extra.armor_set': 'Armor Set',
    'showcase.extra.body_form': 'Body Form',
    'showcase.tab.humanoid': 'Human',
    'showcase.tab.wyvern': 'Dragon',
    'showcase.tab.horse': 'Horse',
    'showcase.tab.wolf': 'Wolf',
    'showcase.debug.title': 'Debug:',
    'showcase.debug.collision': 'Collision',
    'showcase.debug.hurt': 'Hurt',
    'showcase.debug.attack': 'Attack',

    /* ── Race / armor-set display names (local constants in `constants.ts`) ── */
    'showcase.race.skeleton': 'Skeleton',
    'showcase.race.orc': 'Orc',
    'showcase.race.elf': 'Elf',
    'showcase.armor_set.iron': 'Iron Set',
    'showcase.armor_set.mage': 'Mage Robe Set',
    'showcase.armor_set.wind': 'Wind Leather',
    'showcase.set.cloth': 'Cloth Set',
    'showcase.set.leather': 'Leather Set',
    'showcase.set.iron': 'Iron Set',
    'showcase.set.scale': 'Scale Set',
    'showcase.set.stone': 'Stone Set',
    'showcase.set.mage': 'Mage Set',

    /* ── Appearance codex ── */
    'showcase.appearance.armor_stat': (slot, physical, magic, speed) => `${slot} · phys ${physical} magic ${magic} spd ${speed}`,

    /* ── AI behavior × complex terrain ── */
    'showcase.ai.title': 'AI Behavior × Terrain',
    'showcase.ai.subtitle': 'Red vs blue (mutually hostile) · pathfinding / jumping / engagement',
    'showcase.ai.reset': 'Restart battle',

    /* ── Complex terrain & buildings ── */
    'showcase.terrain.title': 'Terrain & Buildings',
    'showcase.terrain.subtitle': 'Switch terrain generator / reseed and inspect every building recipe',
    'showcase.terrain.generator': 'Terrain generator',
    'showcase.terrain.reseed': 'Reseed',
    'showcase.terrain.recipes': 'Building recipes',

    /* ── Interactable effects ── */
    'showcase.interact.title': 'Interactable Effects',
    'showcase.interact.subtitle': 'Click to activate; the switch drives linked doors / gate / elevator',
    'showcase.interact.activate': 'Activate',
    'showcase.interact.kill': 'Kill player',
    'showcase.interact.reset': 'Reset',
    'showcase.interact.hint': 'Click a row\u2019s Activate button to see its effect',
    'showcase.interact.controls': 'Controls: WASD move \u00b7 Space jump \u00b7 Shift roll \u00b7 F interact \u00b7 K kill (camera follows the player; drag to orbit)',
    'showcase.interact.event_save': 'Save point lit',
    'showcase.interact.event_teleport': 'Teleport triggered',

    /* ── Inventory grid ── */
    'showcase.inventory.controls': 'Controls: WASD move \u00b7 Space jump \u00b7 Shift roll \u00b7 F interact \u00b7 Tab toggle inventory (camera follows the player; drag to orbit)',
    'showcase.inventory.hint': 'Press Tab to toggle the inventory; walk to the chest and press F to open the container',
    'showcase.inventory.open': 'Open inventory',
    'showcase.inventory.event_chest': 'Chest opened',

    /* ── Item codex ── */
    'showcase.catalog.title': 'Item Codex',
    'showcase.catalog.subtitle': 'Click a cell to preview the item (equipment / block)',
    'showcase.catalog.hint': 'Select a cell to view item details and appearance',
    'showcase.catalog.all': 'All',
}
