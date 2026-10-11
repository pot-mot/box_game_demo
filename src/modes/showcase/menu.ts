import type {ShowcaseModule, ShowcaseModuleId} from './module.ts'
import {localizeText} from '../../i18n/dom.ts'

/** 展示模式二级菜单：进入展示模式后先显示，选择具体子模块 */
export interface ShowcaseMenu {
    /** 显示菜单（隐藏后重新显示时复用同一 DOM） */
    readonly show: () => void
    readonly hide: () => void
    readonly dispose: () => void
}

/** 一次性注入菜单样式（随 dispose 移除） */
const injectStyles = (): HTMLStyleElement => {
    const style = document.createElement('style')
    style.textContent = `
.sch-menu {
    position: fixed; inset: 0; z-index: 150;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px; background: #0e1116; color: #e8e4da;
    font: 14px/1.6 system-ui, sans-serif; user-select: none;
}
.sch-menu-head { text-align: center; }
.sch-menu-title { font-size: 32px; font-weight: 700; color: #ffd070; letter-spacing: 2px; }
.sch-menu-sub { color: #8f9bb0; margin-top: 6px; }
.sch-menu-grid {
    display: grid; grid-template-columns: repeat(3, 240px);
    gap: 16px; max-width: 90vw;
}
.sch-menu-card {
    display: flex; flex-direction: column; gap: 6px; text-align: left;
    background: #1a1f28; color: #e8e4da; border: 1px solid #313a48;
    border-radius: 10px; padding: 16px 18px; cursor: pointer;
    font: inherit; transition: background .12s, border-color .12s, transform .12s;
}
.sch-menu-card:hover { background: #232b38; border-color: #7a9a5a; transform: translateY(-2px); }
.sch-menu-card-title { font-size: 16px; font-weight: 700; color: #ffe9a0; }
.sch-menu-card-desc { font-size: 12px; color: #9aa3b2; line-height: 1.5; }
`
    document.head.appendChild(style)
    return style
}

/**
 * 创建二级菜单。仅负责条目展示与选择回调，具体模块装配由展示模式控制器负责。
 * 菜单 z-index 低于设置面板（200），保证右上角设置齿轮 / 返回主页面始终可点。
 */
export const createShowcaseMenu = (
    modules: readonly ShowcaseModule[],
    onSelect: (id: ShowcaseModuleId) => void,
): ShowcaseMenu => {
    const style = injectStyles()

    const overlay = document.createElement('div')
    overlay.className = 'sch-menu'

    const head = document.createElement('div')
    head.className = 'sch-menu-head'
    const title = document.createElement('div')
    title.className = 'sch-menu-title'
    localizeText(title, 'showcase.menu.title')
    const sub = document.createElement('div')
    sub.className = 'sch-menu-sub'
    localizeText(sub, 'showcase.menu.subtitle')
    head.appendChild(title)
    head.appendChild(sub)
    overlay.appendChild(head)

    const grid = document.createElement('div')
    grid.className = 'sch-menu-grid'
    for (const module of modules) {
        const card = document.createElement('button')
        card.type = 'button'
        card.className = 'sch-menu-card'
        const cardTitle = document.createElement('span')
        cardTitle.className = 'sch-menu-card-title'
        localizeText(cardTitle, module.title)
        const cardDesc = document.createElement('span')
        cardDesc.className = 'sch-menu-card-desc'
        localizeText(cardDesc, module.description)
        card.appendChild(cardTitle)
        card.appendChild(cardDesc)
        card.addEventListener('click', () => onSelect(module.id))
        grid.appendChild(card)
    }
    overlay.appendChild(grid)

    document.body.appendChild(overlay)

    return {
        show: () => { overlay.style.display = 'flex' },
        hide: () => { overlay.style.display = 'none' },
        dispose: () => {
            overlay.remove()
            style.remove()
        },
    }
}
