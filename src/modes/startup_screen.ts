import type {GameMode} from './constants.ts'
import type {SaveData} from '../save_load/types.ts'
import {cacheSaveData, loadCachedSaveData, clearCachedSaveData} from '../save_load/cache.ts'
import {getLocale, getLocales, setLocale, translate, type LocalKeyParam} from '../i18n/index.ts'
import {LOCALE_DISPLAY_NAMES, isLocale} from '../i18n/constants.ts'
import {localizeText, localizeApply} from '../i18n/dom.ts'

export interface StartupHandlers {
    onStart: (mode: GameMode, saveData?: SaveData) => void
}

/** 创建启动界面：标题 + 模式按钮 + 导入存档 + 语言切换 */
export const setupStartupScreen = (handlers: StartupHandlers): void => {
    const overlay = document.createElement('div')
    overlay.id = 'startup-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:#111'
    document.body.appendChild(overlay)

    const box = document.createElement('div')
    box.style.cssText = 'text-align:center;padding:48px 64px;background:#1a1a1a;border:1px solid #333'
    overlay.appendChild(box)

    const title = document.createElement('h1')
    title.style.cssText = 'font:600 56px/1.2 system-ui,sans-serif;color:#fff;letter-spacing:4px'
    localizeText(title, 'startup.title')
    box.appendChild(title)

    const subtitle = document.createElement('p')
    subtitle.style.cssText = 'font:18px/1.6 system-ui,sans-serif;color:#888;margin-top:8px;margin-bottom:32px'
    localizeText(subtitle, 'startup.subtitle')
    box.appendChild(subtitle)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:16px;justify-content:center;margin-bottom:24px'
    box.appendChild(btnRow)

    const makeBtn = (text: LocalKeyParam, extraCss?: string): HTMLButtonElement => {
        const b = document.createElement('button')
        b.style.cssText = `padding:14px 48px;font:500 18px system-ui,sans-serif;border:1px solid #555;cursor:pointer;background:#222;color:#fff${extraCss ?? ''}`
        localizeText(b, text)
        b.addEventListener('mouseenter', () => {
            b.style.background = extraCss ? '#2a4a7c' : '#333'
        })
        b.addEventListener('mouseleave', () => {
            b.style.background = extraCss ? '#1a3a5c' : '#222'
        })
        return b
    }

    const editBtn = makeBtn('startup.mode.edit')
    btnRow.appendChild(editBtn)

    const playBtn = makeBtn('startup.mode.play', ';background:#1a3a5c;border-color:#2a6a9c')
    btnRow.appendChild(playBtn)

    const showcaseBtn = makeBtn('startup.mode.showcase')
    btnRow.appendChild(showcaseBtn)

    const boneEditBtn = makeBtn('startup.mode.bone_edit', ';background:#1a3a2c;border-color:#2a6a4c')
    btnRow.appendChild(boneEditBtn)

    // 语言切换
    const langRow = document.createElement('div')
    langRow.style.cssText = 'font:14px system-ui,sans-serif;color:#888;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px'
    box.appendChild(langRow)

    const langLabel = document.createElement('span')
    localizeText(langLabel, 'settings.language')
    langRow.appendChild(langLabel)

    const langSelect = document.createElement('select')
    langSelect.id = 'startup-language'
    langSelect.style.cssText = 'font:inherit;background:#222;color:#fff;border:1px solid #555;padding:2px 6px'
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

    // 导入存档（自绘文件选择：原生 input 的「选择文件 / 未选择文件」由浏览器提供，无法本地化）
    const importRow = document.createElement('div')
    importRow.style.cssText = 'font:14px system-ui,sans-serif;color:#888;display:flex;align-items:center;justify-content:center;gap:8px'
    box.appendChild(importRow)

    const importLabel = document.createElement('span')
    localizeText(importLabel, 'startup.import_label')
    importRow.appendChild(importLabel)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.json'
    fileInput.style.display = 'none'

    const chooseFileBtn = document.createElement('button')
    chooseFileBtn.type = 'button'
    chooseFileBtn.style.cssText = 'font:inherit;background:#222;color:#fff;border:1px solid #555;padding:2px 10px;cursor:pointer'
    localizeText(chooseFileBtn, 'startup.choose_file')
    chooseFileBtn.addEventListener('click', () => fileInput.click())
    importRow.appendChild(chooseFileBtn)

    let chosenFileName: string | undefined
    const chosenNameEl = document.createElement('span')
    localizeApply(chosenNameEl, el => {
        el.textContent = chosenFileName ?? translate('startup.no_file')
    })
    importRow.appendChild(chosenNameEl)
    importRow.appendChild(fileInput)

    // ── 缓存存档指示 ──
    const cacheRow = document.createElement('div')
    cacheRow.style.cssText = 'margin-top:16px;font:14px system-ui,sans-serif;color:#888'
    box.appendChild(cacheRow)

    const cacheLabel = document.createElement('span')
    localizeText(cacheLabel, 'startup.has_cache')
    cacheRow.appendChild(cacheLabel)

    const clearCacheBtn = document.createElement('a')
    clearCacheBtn.style.cssText = 'color:#f88;cursor:pointer;margin-left:12px;text-decoration:underline'
    localizeText(clearCacheBtn, 'startup.clear')
    cacheRow.appendChild(clearCacheBtn)

    const showCache = (): void => {
        const cached = loadCachedSaveData()
        if (cached) {
            cacheRow.style.display = ''
            cachedData = cached
        } else {
            cacheRow.style.display = 'none'
        }
    }

    clearCacheBtn.addEventListener('click', () => {
        clearCachedSaveData()
        cachedData = undefined
        cacheRow.style.display = 'none'
    })

    let importedData: SaveData | undefined
    let cachedData: SaveData | undefined

    showCache()

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0]
        if (!file) return
        chosenFileName = file.name
        chosenNameEl.textContent = file.name
        const reader = new FileReader()
        reader.onload = () => {
            try {
                if (typeof reader.result !== 'string') return
                const raw = JSON.parse(reader.result) as unknown
                import('../save_load/validation.ts').then(({validateSaveData}) => {
                    try {
                        const validated = validateSaveData(raw)
                        importedData = validated
                        cacheSaveData(validated)
                        cacheRow.style.display = 'none'
                        importLabel.textContent = translate({key: 'startup.imported', args: [file.name]})
                        importLabel.style.color = '#8f8'
                    } catch {
                        importLabel.textContent = translate('startup.invalid_save')
                        importLabel.style.color = '#f88'
                    }
                })
            } catch {
                importLabel.textContent = translate('startup.parse_failed')
                importLabel.style.color = '#f88'
            }
        }
        reader.readAsText(file)
    })

    const dismiss = (mode: GameMode): void => {
        overlay.remove()
        /* 展示/骨骼动画模式为独立干净场景，不加载存档元素 */
        const saveData = mode === 'showcase' || mode === 'bone_edit'
            ? undefined
            : importedData ?? cachedData
        handlers.onStart(mode, saveData)
    }

    editBtn.addEventListener('click', () => dismiss('edit'))
    playBtn.addEventListener('click', () => dismiss('play'))
    showcaseBtn.addEventListener('click', () => dismiss('showcase'))
    boneEditBtn.addEventListener('click', () => dismiss('bone_edit'))
}
