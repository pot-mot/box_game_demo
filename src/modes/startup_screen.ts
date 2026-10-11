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
    overlay.className = 'dc-overlay dc-overlay--solid'
    overlay.style.zIndex = '1000'
    document.body.appendChild(overlay)

    const box = document.createElement('div')
    box.className = 'dc-panel'
    box.style.cssText = 'text-align:center;padding:48px 64px'
    overlay.appendChild(box)

    const title = document.createElement('h1')
    title.className = 'dc-title'
    localizeText(title, 'startup.title')
    box.appendChild(title)

    const subtitle = document.createElement('p')
    subtitle.className = 'dc-subtitle'
    subtitle.style.cssText = 'margin-top:8px;margin-bottom:32px'
    localizeText(subtitle, 'startup.subtitle')
    box.appendChild(subtitle)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:16px;justify-content:center;margin-bottom:24px'
    box.appendChild(btnRow)

    const makeBtn = (text: LocalKeyParam, variant?: string): HTMLButtonElement => {
        const b = document.createElement('button')
        b.className = `dc-btn dc-btn--lg${variant !== undefined ? ` ${variant}` : ''}`
        localizeText(b, text)
        return b
    }

    const editBtn = makeBtn('startup.mode.edit')
    btnRow.appendChild(editBtn)

    const playBtn = makeBtn('startup.mode.play', 'dc-btn--primary')
    btnRow.appendChild(playBtn)

    const showcaseBtn = makeBtn('startup.mode.showcase')
    btnRow.appendChild(showcaseBtn)

    const boneEditBtn = makeBtn('startup.mode.bone_edit')
    btnRow.appendChild(boneEditBtn)

    // 语言切换
    const langRow = document.createElement('div')
    langRow.className = 'dc-label'
    langRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px'
    box.appendChild(langRow)

    const langLabel = document.createElement('span')
    localizeText(langLabel, 'settings.language')
    langRow.appendChild(langLabel)

    const langSelect = document.createElement('select')
    langSelect.id = 'startup-language'
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

    // 导入存档（自绘文件选择：原生 input 的「选择文件 / 未选择文件」由浏览器提供，无法本地化）
    const importRow = document.createElement('div')
    importRow.className = 'dc-label'
    importRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px'
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
    chooseFileBtn.className = 'dc-btn'
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
    cacheRow.className = 'dc-label'
    cacheRow.style.cssText = 'margin-top:16px'
    box.appendChild(cacheRow)

    const cacheLabel = document.createElement('span')
    localizeText(cacheLabel, 'startup.has_cache')
    cacheRow.appendChild(cacheLabel)

    const clearCacheBtn = document.createElement('a')
    clearCacheBtn.className = 'dc-text-danger'
    clearCacheBtn.style.cssText = 'cursor:pointer;margin-left:12px;text-decoration:underline'
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
                        importLabel.className = 'dc-text-success'
                    } catch {
                        importLabel.textContent = translate('startup.invalid_save')
                        importLabel.className = 'dc-text-danger'
                    }
                })
            } catch {
                importLabel.textContent = translate('startup.parse_failed')
                importLabel.className = 'dc-text-danger'
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
