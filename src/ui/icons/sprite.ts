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
