import type {GameMode} from './constants.ts'
import type {SaveData} from '../save_load/types.ts'
import {cacheSaveData, loadCachedSaveData, clearCachedSaveData} from '../save_load/cache.ts'

export interface StartupHandlers {
    onStart: (mode: GameMode, saveData?: SaveData) => void
}

/** 创建启动界面：标题 + 双模式按钮 + 导入存档 */
export const setupStartupScreen = (handlers: StartupHandlers): void => {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:#111'
    document.body.appendChild(overlay)

    const box = document.createElement('div')
    box.style.cssText = 'text-align:center;padding:48px 64px;background:#1a1a1a;border:1px solid #333'
    overlay.appendChild(box)

    const title = document.createElement('h1')
    title.style.cssText = 'font:600 56px/1.2 system-ui,sans-serif;color:#fff;letter-spacing:4px'
    title.textContent = 'Box Demo'
    box.appendChild(title)

    const subtitle = document.createElement('p')
    subtitle.style.cssText = 'font:18px/1.6 system-ui,sans-serif;color:#888;margin-top:8px;margin-bottom:32px'
    subtitle.textContent = '3D 物理沙盒'
    box.appendChild(subtitle)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:16px;justify-content:center;margin-bottom:24px'
    box.appendChild(btnRow)

    const makeBtn = (text: string, extraCss?: string): HTMLButtonElement => {
        const b = document.createElement('button')
        b.style.cssText = `padding:14px 48px;font:500 18px system-ui,sans-serif;border:1px solid #555;cursor:pointer;background:#222;color:#fff${extraCss ?? ''}`
        b.textContent = text
        b.addEventListener('mouseenter', () => {
            b.style.background = extraCss ? '#2a4a7c' : '#333'
        })
        b.addEventListener('mouseleave', () => {
            b.style.background = extraCss ? '#1a3a5c' : '#222'
        })
        return b
    }

    const editBtn = makeBtn('编辑模式')
    btnRow.appendChild(editBtn)

    const playBtn = makeBtn('游玩模式', ';background:#1a3a5c;border-color:#2a6a9c')
    btnRow.appendChild(playBtn)

    // 导入存档
    const importRow = document.createElement('div')
    importRow.style.cssText = 'font:14px system-ui,sans-serif;color:#888;display:flex;align-items:center;justify-content:center;gap:8px'
    box.appendChild(importRow)

    const importLabel = document.createElement('span')
    importLabel.textContent = '导入存档：'
    importRow.appendChild(importLabel)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.json'
    fileInput.style.cssText = 'color:#fff;font:inherit'
    importRow.appendChild(fileInput)

    // ── 缓存存档指示 ──
    const cacheRow = document.createElement('div')
    cacheRow.style.cssText = 'margin-top:16px;font:14px system-ui,sans-serif;color:#888'
    box.appendChild(cacheRow)

    const cacheLabel = document.createElement('span')
    cacheRow.appendChild(cacheLabel)

    const clearCacheBtn = document.createElement('a')
    clearCacheBtn.style.cssText = 'color:#f88;cursor:pointer;margin-left:12px;text-decoration:underline'
    clearCacheBtn.textContent = '清除'
    cacheRow.appendChild(clearCacheBtn)

    const showCache = (): void => {
        const cached = loadCachedSaveData()
        if (cached) {
            cacheLabel.textContent = '存在上次的存档'
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
                        importLabel.textContent = `已导入：${file.name}`
                        importLabel.style.color = '#8f8'
                    } catch {
                        importLabel.textContent = '存档格式无效！'
                        importLabel.style.color = '#f88'
                    }
                })
            } catch {
                importLabel.textContent = '文件解析失败！'
                importLabel.style.color = '#f88'
            }
        }
        reader.readAsText(file)
    })

    const dismiss = (mode: GameMode): void => {
        overlay.remove()
        handlers.onStart(mode, importedData ?? cachedData)
    }

    editBtn.addEventListener('click', () => dismiss('edit'))
    playBtn.addEventListener('click', () => dismiss('play'))
}
