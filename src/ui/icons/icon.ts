/**
 * 图标工厂
 * 依据 sprite 中的 <symbol> 生成 <svg><use> 引用，供面板 / HUD 复用。
 * 颜色继承 currentColor；尺寸走 dc-icon 尺寸类。规范见 docs/ui/ui_style_guide.md 第 7 节。
 */

import {installIconSprite, type IconName} from './sprite.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 图标尺寸档（对应 .dc-icon--sm / 默认 / --lg） */
export type IconSize = 'sm' | 'default' | 'lg'

export interface IconOptions {
    readonly size?: IconSize
    /** 无障碍名称；提供时图标作为语义图形，否则视为装饰 */
    readonly title?: string
    /** 附加类名（与 dc-icon 并存） */
    readonly className?: string
}

/**
 * 创建单个图标元素。
 * @param name 图标名（须存在于 ICON_NAMES）
 */
export const createIcon = (name: IconName, options?: IconOptions): SVGSVGElement => {
    installIconSprite()
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    const classes = ['dc-icon']
    if (options?.size === 'sm') classes.push('dc-icon--sm')
    else if (options?.size === 'lg') classes.push('dc-icon--lg')
    if (options?.className !== undefined && options.className.length > 0) classes.push(options.className)
    svg.setAttribute('class', classes.join(' '))

    if (options?.title !== undefined && options.title.length > 0) {
        svg.setAttribute('role', 'img')
        svg.setAttribute('aria-label', options.title)
    } else {
        svg.setAttribute('aria-hidden', 'true')
    }

    const use = document.createElementNS(SVG_NS, 'use')
    use.setAttribute('href', `#dc-icon-${name}`)
    svg.appendChild(use)
    return svg
}
