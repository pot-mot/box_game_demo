/**
 * 全局 SVG 图标 sprite
 * 统一 24×24 viewBox、描边式（fill:none / stroke:currentColor / stroke-width:1.5），颜色继承父级。
 * 由 agent 生成并集中维护；业务组件经 createIcon() 引用，禁止内联或使用 Unicode 图标。
 * 规范见 docs/ui/ui_style_guide.md 第 7 节。
 */

/** 图标名清单（新增图标必须登记于此，供类型穷尽与测试锁定） */
export const ICON_NAMES = [
    'close',
    'plus',
    'minus',
    'trash',
    'check',
    'pencil',
    'refresh',
    'undo',
    'redo',
    'save',
    'import',
    'export',
    'chevron-down',
    'chevron-right',
    'chevron-left',
    'arrow-up',
    'warning',
    'info',
    'lock',
    'unlock',
    'eye',
    'eye-off',
    'play',
    'pause',
    'stop',
    'step',
    'settings',
    'map-pin',
    'backpack',
    'armor',
    'sword',
    'bow',
    'crosshair',
    'heart',
    'bolt',
    'flame',
    'brush',
    'drag',
    'rune',
    'flourish',
    /* ── 物品图标（背包 / 图鉴用，逐物品专属；物品定义 `ItemDef.icon` 引用） ── */
    'item-short-sword',
    'item-long-sword',
    'item-heavy-sword',
    'item-spear',
    'item-war-hammer',
    'item-dual-axe',
    'item-shield-small',
    'item-shield-medium',
    'item-shield-large',
    'item-longbow',
    'item-crossbow',
    'item-shotgun',
    'item-staff',
    'item-magic-wand',
    'item-throwing-axe',
    'item-grenade',
    'item-molotov',
    'item-throwing-dart',
    'item-cloth-cap',
    'item-iron-helmet',
    'item-mage-hood',
    'item-cloth-vest',
    'item-iron-plate',
    'item-leather-armor',
    'item-mage-robe',
    'item-scale-mail',
    'item-cloth-bracers',
    'item-iron-bracers',
    'item-battle-bracers',
    'item-mage-wraps',
    'item-cloth-pants',
    'item-iron-greaves',
    'item-mage-leggings',
    'item-swift-boots',
    'item-wind-boots',
    'item-block',
    'item-block-destruction',
    'item-block-burning',
    'item-block-magnet',
    'item-block-elasticity',
    'item-block-water',
    'item-flask',
    'item-stone',
    'item-key',
] as const

export type IconName = typeof ICON_NAMES[number]

/** sprite 根元素 id（重复安装时用于去重） */
export const ICON_SPRITE_ID = 'dc-icon-sprite'

/** 各图标的几何路径（同一 24×24 坐标系；描边参数由 .dc-icon 类统一提供） */
const ICON_PATHS: Record<IconName, string> = {
    'close': 'M6 6l12 12M18 6L6 18',
    'plus': 'M12 5v14M5 12h14',
    'minus': 'M5 12h14',
    'trash': 'M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12',
    'check': 'M5 12l4 4L19 6',
    'pencil': 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    'refresh': 'M19 12a7 7 0 1 1-2-4.9M19 5v4h-4',
    'undo': 'M9 7L4 12l5 5M4 12h10a5 5 0 0 1 5 5',
    'redo': 'M15 7l5 5-5 5M20 12H10a5 5 0 0 0-5 5',
    'save': 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    'import': 'M12 4v10M8 11l4 4 4-4M5 20h14',
    'export': 'M12 20V10M8 13l4-4 4 4M5 4h14',
    'chevron-down': 'M6 9l6 6 6-6',
    'chevron-right': 'M9 6l6 6-6 6',
    'chevron-left': 'M15 6l-6 6 6 6',
    'arrow-up': 'M12 20V5M6 11l6-6 6 6',
    'warning': 'M12 3l9 16H3zM12 10v4M12 17h.01',
    'info': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
    'lock': 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
    'unlock': 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 5.9-.7',
    'eye': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    'eye-off': 'M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c6 0 10 6 10 6a16.7 16.7 0 0 1-3.4 4M6.2 8.4A16.4 16.4 0 0 0 2 12s4 6 10 6a9.6 9.6 0 0 0 3.2-.5M9.9 9.9a3 3 0 0 0 4.2 4.2',
    'play': 'M7 5l12 7-12 7z',
    'pause': 'M8 5v14M16 5v14',
    'stop': 'M6 6h12v12H6z',
    'step': 'M7 5l9 7-9 7zM17 5v14',
    'settings': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    'map-pin': 'M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
    'backpack': 'M6 10a6 6 0 0 1 12 0v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM9 10V7a3 3 0 0 1 6 0v3M9 13h6v4H9z',
    'armor': 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z',
    'sword': 'M18 3l3 3-9.5 9.5-2.5.5.5-2.5zM7 14l3 3M4 17l3 3',
    'bow': 'M6 3a14 14 0 0 1 12 12M6 3v2.5A11.5 11.5 0 0 0 17.5 17H20M4 20L18 6M15 6h3v3',
    'crosshair': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 3v4M12 17v4M3 12h4M17 12h4M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
    'heart': 'M12 20s-7-4.4-9.3-8.4A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5.6C19 15.6 12 20 12 20z',
    'bolt': 'M13 2L4 14h6l-1 8 9-12h-6z',
    'flame': 'M12 22c4 0 6-2.6 6-6 0-4-3-6-3-9 0 0-3 1.5-3 5 0-1.5-1-3-2-4 0 0-4 3-4 8 0 3.4 2 6 6 6z',
    'brush': 'M4 20s1-3 3-3 2 3 0 3H4zM8 15l8-8 3 3-8 8-3-3z',
    'drag': 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    'rune': 'M12 3l6 4v10l-6 4-6-4V7zM12 3v18M6 7l12 10M18 7L6 17',
    'flourish': 'M3 12h6M15 12h6M12 7l3 5-3 5-3-5z',
    /* ── 物品图标 ── */
    'item-short-sword': 'M11 3h2v6h-2zM9 9h6M12 9v4M10 13h4',
    'item-long-sword': 'M11 2h2v9h-2zM9 11h6M12 11v5M10 16h4',
    'item-heavy-sword': 'M10 2h4v10h-4zM8 12h8M12 12v5M10 17h4',
    'item-spear': 'M12 2l2.5 4h-5zM11 6h2v13h-2zM9 19h6',
    'item-war-hammer': 'M7 3h10v5H7zM12 8v11M10 19h4',
    'item-dual-axe': 'M12 3v17M10 20h4M12 5L7 7v4l5 2M12 5l5 2v4l-5 2',
    'item-shield-small': 'M12 5l4 1.5v4c0 3-2 4.8-4 6-2-1.2-4-3-4-6v-4z',
    'item-shield-medium': 'M12 3l6 2v6c0 4-3 6.5-6 8-3-1.5-6-4-6-8V5zM12 5v12',
    'item-shield-large': 'M12 2l8 3v7c0 5-4 7.5-8 9-4-1.5-8-4-8-9V5zM12 4v16M9 9h6',
    'item-longbow': 'M7 3a13 13 0 0 1 11 11M7 3l11 11M5 19L18 6M15 6h3v3',
    'item-crossbow': 'M12 6v13M4 9c3-4 13-4 16 0M4 9l8 3 8-3M10 19h4',
    'item-shotgun': 'M3 11h13v2H3zM16 11l5 1v2l-4 1zM8 13l-2 5h3l1-3',
    'item-staff': 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 8v13M10 21h4',
    'item-magic-wand': 'M4 20L13 11M17 1l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',
    'item-throwing-axe': 'M12 4v16M9 20h6M12 4l4 1v5l-4 1z',
    'item-grenade': 'M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 9V7M10 5h4M14 6l2-2M16 4h2M17 3v2',
    'item-molotov': 'M10 4h4v3l2 3v9H8v-9l2-3zM12 4V2M10 2h4M12 2l2-1M12 2l-2-1',
    'item-throwing-dart': 'M20 4L4 20M20 4l-1 6M20 4l-6 1M4 20l1-5M4 20l5-1',
    'item-cloth-cap': 'M6 15a6 6 0 0 1 12 0zM12 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3',
    'item-iron-helmet': 'M5 13a7 7 0 0 1 14 0v5H5zM12 12v8M8 12h3M13 12h3',
    'item-mage-hood': 'M12 3c-4 2-6 6-6 10 0 2 2 3 6 3s6-1 6-3c0-4-2-8-6-10zM9 13a3 3 0 0 1 6 0',
    'item-cloth-vest': 'M8 4l4 2 4-2 3 4v11l-2 2H7l-2-2V8zM12 6v15',
    'item-iron-plate': 'M8 4l4 2 4-2 3 4v11l-2 2H7l-2-2V8zM7 12h10M9 16h6',
    'item-leather-armor': 'M8 4l4 2 4-2 3 4v11l-2 2H7l-2-2V8zM8 8l8 8',
    'item-mage-robe': 'M9 4l3 2 3-2 2 4-1 3 3 8H5l3-8-1-3zM12 6v16M9 4L7 8M15 4l2 4',
    'item-scale-mail': 'M8 4l4 2 4-2 3 4v11l-2 2H7l-2-2V8zM9 11h6M9 15h6M12 9v10',
    'item-cloth-bracers': 'M6 8h12v8H6zM9 8v8',
    'item-iron-bracers': 'M6 8h12l-1 9H7zM9 8v9M15 8v9',
    'item-battle-bracers': 'M6 8h12l-1 9H7zM8 8l-2-2M12 8V5M16 8l2-2',
    'item-mage-wraps': 'M5 8c3 0 3 2 6 2s3-2 6-2M5 12c3 0 3 2 6 2s3-2 6-2M5 16c3 0 3 2 6 2s3-2 6-2',
    'item-cloth-pants': 'M7 4h10v5l-1 12h-3l-1-9-1 9H8L7 9zM7 9h10',
    'item-iron-greaves': 'M9 4h6v11l-2 5H9zM9 9h6M9 13h6',
    'item-mage-leggings': 'M7 4h10v5l-1 12h-3l-1-9-1 9H8L7 9zM11 7l1 2 1-2',
    'item-swift-boots': 'M8 5h5v8l4 2v4H8zM8 15h9M8 10h5',
    'item-wind-boots': 'M9 5h5v7l4 2v4H9zM9 15h9M9 5l-4-1M9 8H5',
    'item-block': 'M12 3l8 4-8 4-8-4zM4 7v8l8 4 8-4V7M12 11v8',
    'item-block-destruction': 'M12 3l8 4-8 4-8-4zM4 7v8l8 4 8-4V7M12 11v8M10 5l2 2-1 2M14 5l-2 2 1 2',
    'item-block-burning': 'M12 3l8 4-8 4-8-4zM4 7v8l8 4 8-4V7M12 11v8M12 9.5c1 0 1.8-.8 1.8-1.7 0-1.3-1.8-3.3-1.8-3.3S10.2 6.5 10.2 7.8c0 .9.8 1.7 1.8 1.7z',
    'item-block-magnet': 'M12 3l8 4-8 4-8-4zM4 7v8l8 4 8-4V7M12 11v8M9.5 9V7a2.5 2.5 0 0 1 5 0v2M9.5 9h1.5M14.5 9h-1.5',
    'item-block-elasticity': 'M12 3l8 4-8 4-8-4zM4 7v8l8 4 8-4V7M12 11v8M9 8.5l1.5-1.5L12 8.5l1.5-1.5L15 8.5',
    'item-block-water': 'M12 3l8 4-8 4-8-4zM4 7v8l8 4 8-4V7M12 11v8M12 9a2 2 0 0 0 2-2c0-1.3-2-3.4-2-3.4S10 5.7 10 7a2 2 0 0 0 2 2z',
    'item-flask': 'M10 3h4v3l2 3v11H8V9l2-3zM12 3V1M8 13h8',
    'item-stone': 'M6 17l2-8 5-3 5 4-1 7zM8 11l5 2 5-2M13 8v5',
    'item-key': 'M15 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0M11 12v9M11 16h3M11 19h3',
}

/** 生成 sprite 的完整 SVG 标记（隐藏展示，供 <use> 引用） */
const buildSpriteMarkup = (): string => {
    const symbols = ICON_NAMES.map(name => {
        const d = ICON_PATHS[name]
        return `<symbol id="dc-icon-${name}" viewBox="0 0 24 24"><path d="${d}"/></symbol>`
    }).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`
}

/**
 * 安装图标 sprite 到 document（幂等）。应在应用启动早期调用一次。
 * @returns 实际注入的 sprite 根元素
 */
export const installIconSprite = (): SVGElement => {
    const existing = document.getElementById(ICON_SPRITE_ID)
    if (existing instanceof SVGElement) return existing
    const host = document.createElement('div')
    host.innerHTML = buildSpriteMarkup()
    const svg = host.firstElementChild
    if (!(svg instanceof SVGElement)) {
        throw new Error('图标 sprite 构建失败')
    }
    svg.id = ICON_SPRITE_ID
    document.body.appendChild(svg)
    return svg
}
