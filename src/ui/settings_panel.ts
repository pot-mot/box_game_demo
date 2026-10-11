/**
 * 设置面板（右上角齿轮按钮）。
 * 提供语言切换、回到主页面、打开操作设置的入口；play 模式额外提供「传送至最近存档点」（脱困）。
 * @param openOperations 打开操作设置面板（键盘 + 鼠标绑定）
 * @param onReturnHome 可选，覆盖“返回主页面”的默认 reload 行为（展示模式需优雅退出）
 * @param onTeleportToSave 可选，play 模式「传送至最近存档点」回调（脱困）
 */
import {getLocale, getLocales, setLocale, type LocalKeyParam} from '../i18n/index.ts'
import {LOCALE_DISPLAY_NAMES, isLocale} from '../i18n/constants.ts'
import {localizeText, localizeTitle} from '../i18n/dom.ts'
import {createIcon} from './icons/icon.ts'

export const setupSettingsPanel = (
    openOperations: () => void,
    onReturnHome?: () => void,
    onTeleportToSave?: () => void,
): void => {
    const btn = document.createElement('button')
    btn.id = 'settings-btn'
    btn.className = 'dc-icon-btn'
    btn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:200;width:40px;height:40px'
    localizeTitle(btn, 'settings.title')
    btn.appendChild(createIcon('settings', {size: 'lg'}))
    document.body.appendChild(btn)

    const menu = document.createElement('div')
    menu.id = 'settings-menu'
    menu.className = 'dc-panel'
    menu.style.cssText = [
        'position:fixed;top:64px;right:16px;z-index:200',
        'display:none;min-width:200px;padding:4px 0',
    ].join(';')
    document.body.appendChild(menu)

    const createItem = (text: LocalKeyParam, onClick: () => void): HTMLElement => {
        const el = document.createElement('div')
        el.className = 'dc-menu-item'
        localizeText(el, text)
        el.addEventListener('click', onClick)
        return el
    }

    let open = false

    menu.appendChild(createItem('settings.return_home', () => {
        close()
        if (onReturnHome) {
            onReturnHome()
        } else {
            window.location.reload()
        }
    }))

    menu.appendChild(createItem('settings.operations', () => {
        close()
        openOperations()
    }))

    if (onTeleportToSave !== undefined) {
        menu.appendChild(createItem('settings.teleport_save', () => {
            close()
            onTeleportToSave()
        }))
    }

    /* ── 语言切换行 ── */
    const langRow = document.createElement('div')
    langRow.className = 'dc-menu-item'
    langRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:default'
    const langLabel = document.createElement('span')
    localizeText(langLabel, 'settings.language')
    langRow.appendChild(langLabel)
    const langSelect = document.createElement('select')
    langSelect.id = 'settings-language'
    langSelect.className = 'dc-select'
    for (const locale of getLocales()) {
        const opt = document.createElement('option')
        opt.value = locale
        opt.textContent = LOCALE_DISPLAY_NAMES[locale]
        langSelect.appendChild(opt)
    }
    langSelect.value = getLocale()
    langSelect.addEventListener('change', () => {
        if (isLocale(langSelect.value)) setLocale(langSelect.value)
    })
    langRow.appendChild(langSelect)
    menu.appendChild(langRow)

    const close = (): void => {
        open = false
        menu.style.display = 'none'
    }

    btn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation()
        open = !open
        menu.style.display = open ? 'block' : 'none'
    })

    document.addEventListener('click', (e: MouseEvent) => {
        if (open && !menu.contains(e.target as Node) && e.target !== btn) {
            close()
        }
    })
}
