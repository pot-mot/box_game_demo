import type {GameMode} from './constants.ts'
import type {SaveData} from '../save_load/types.ts'
import {cacheSaveData, loadCachedSaveData, clearCachedSaveData} from '../save_load/cache.ts'

export interface StartupHandlers {
    onStart: (mode: GameMode, saveData?: SaveData) => void
}

/** 创建启动界面：标题 + 双模式按钮 + 导入存档 */
export const setupStartupScreen = (handlers: StartupHandlers): void => {
    const overlay = document.createElement('div')
    overlay.id = 'startup-overlay'
    document.body.appendChild(overlay)

    const box = document.createElement('div')
    box.id = 'startup-box'
    overlay.appendChild(box)

    const title = document.createElement('h1')
    title.id = 'startup-title'
    title.textContent = 'Box Demo'
    box.appendChild(title)

    const subtitle = document.createElement('p')
    subtitle.id = 'startup-subtitle'
    subtitle.textContent = '3D 物理沙盒'
    box.appendChild(subtitle)

    const btnRow = document.createElement('div')
    btnRow.id = 'startup-buttons'
    box.appendChild(btnRow)

    const editBtn = document.createElement('button')
    editBtn.className = 'startup-btn'
    editBtn.textContent = '编辑模式'
    btnRow.appendChild(editBtn)

    const playBtn = document.createElement('button')
    playBtn.className = 'startup-btn startup-btn-play'
    playBtn.textContent = '游玩模式'
    btnRow.appendChild(playBtn)

    // 导入存档
    const importRow = document.createElement('div')
    importRow.id = 'startup-import'
    box.appendChild(importRow)

    const importLabel = document.createElement('span')
    importLabel.textContent = '导入存档：'
    importRow.appendChild(importLabel)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.json'
    fileInput.id = 'startup-file-input'
    importRow.appendChild(fileInput)

    // ── 缓存存档指示 ──
    const cacheRow = document.createElement('div')
    cacheRow.id = 'startup-cache'
    box.appendChild(cacheRow)

    const cacheLabel = document.createElement('span')
    cacheLabel.id = 'startup-cache-label'
    cacheRow.appendChild(cacheLabel)

    const clearCacheBtn = document.createElement('a')
    clearCacheBtn.id = 'startup-cache-clear'
    clearCacheBtn.textContent = '清除'
    clearCacheBtn.style.cssText = 'cursor:pointer;margin-left:12px;text-decoration:underline'
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
                const raw = JSON.parse(reader.result as string) as unknown
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
