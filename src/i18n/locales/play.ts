/**
 * 游玩模式文案域（HUD / 死亡 / 背包 / 箱子 / 地图）。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `playZh`、英文表 `playEn` 必须结构一致。
 */
export type PlayLocale = {
    'play.hud.hp': string
    'play.hud.poise': string
    'play.hud.guard': string
    'play.hud.charge': string
    'play.hud.timers': string
    'play.hud.skills': string
    'play.hud.col.action': string
    'play.hud.col.recovery': string
    'play.hud.col.cooldown': string
    'play.hud.loadout': (weapon: string, hold: string) => string
    'play.hud.charge_pct': (pct: string) => string
    'play.hud.state': (name: string, time: string) => string
    'play.death.title': string
    'play.death.restart': string
    'play.death.menu': string
    'play.inventory.title': string
    'play.inventory.detail_hint': string
    'play.inventory.equip': string
    'play.inventory.equipped': string
    'play.inventory.drop': string
    'play.container.title': string
    'play.container.player': string
    'play.container.chest': string
    'play.container.hint': string
    'play.container.close': string
    'play.container.named': (id: string) => string
    'play.map.title': string
    'play.map.hint': string
    'play.hotbar.roll': string
    'play.prompt.interact': (text: string) => string
}

export const playZh: PlayLocale = {
    'play.hud.hp': '玩家生命',
    'play.hud.poise': '韧性',
    'play.hud.guard': '格挡',
    'play.hud.charge': '蓄力',
    'play.hud.timers': '计时器',
    'play.hud.skills': '技能',
    'play.hud.col.action': '动作',
    'play.hud.col.recovery': '恢复',
    'play.hud.col.cooldown': '冷却',
    'play.hud.loadout': (weapon, hold) => `${weapon} · ${hold}（Ctrl 切换）`,
    'play.hud.charge_pct': (pct) => `蓄力 ${pct}%`,
    'play.hud.state': (name, time) => `状态: ${name}  ${time}s`,
    'play.death.title': '你死了',
    'play.death.restart': '重新开始',
    'play.death.menu': '返回菜单',
    'play.inventory.title': '背包 / 装备',
    'play.inventory.detail_hint': '点击物品查看详情',
    'play.inventory.equip': '装备',
    'play.inventory.equipped': '已装备',
    'play.inventory.drop': '丢弃',
    'play.container.title': '箱子',
    'play.container.player': '背包',
    'play.container.chest': '箱子',
    'play.container.hint': '拖拽物品在背包与箱子间存取；双击快速转移；拖拽中按 R 旋转',
    'play.container.close': '关闭',
    'play.container.named': (id) => `箱子 #${id}`,
    'play.map.title': '地图',
    'play.map.hint': '点击已解锁的传送点进行传送',
    'play.hotbar.roll': '翻滚',
    'play.prompt.interact': (text) => `[F] ${text}`,
}

export const playEn: PlayLocale = {
    'play.hud.hp': 'PLAYER HP',
    'play.hud.poise': 'POISE',
    'play.hud.guard': 'GUARD',
    'play.hud.charge': 'CHARGE',
    'play.hud.timers': 'TIMERS',
    'play.hud.skills': 'SKILLS',
    'play.hud.col.action': 'Action',
    'play.hud.col.recovery': 'Recovery',
    'play.hud.col.cooldown': 'Cooldown',
    'play.hud.loadout': (weapon, hold) => `${weapon} · ${hold} (Ctrl to switch)`,
    'play.hud.charge_pct': (pct) => `CHARGE ${pct}%`,
    'play.hud.state': (name, time) => `ST: ${name}  ${time}s`,
    'play.death.title': 'YOU DIED',
    'play.death.restart': 'Restart',
    'play.death.menu': 'Back to Menu',
    'play.inventory.title': 'Inventory / Equipment',
    'play.inventory.detail_hint': 'Click an item for details',
    'play.inventory.equip': 'Equip',
    'play.inventory.equipped': 'Equipped',
    'play.inventory.drop': 'Drop',
    'play.container.title': 'Chest',
    'play.container.player': 'Inventory',
    'play.container.chest': 'Chest',
    'play.container.hint': 'Drag items between inventory and chest; double-click to transfer; press R while dragging to rotate',
    'play.container.close': 'Close',
    'play.container.named': (id) => `Chest #${id}`,
    'play.map.title': 'Map',
    'play.map.hint': 'Click an unlocked teleport point to travel',
    'play.hotbar.roll': 'Roll',
    'play.prompt.interact': (text) => `[F] ${text}`,
}
