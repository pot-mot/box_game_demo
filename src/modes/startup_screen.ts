import type {GameMode} from './constants.ts'
import type {SaveData} from '../save_load/types.ts'

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

    let importedData: SaveData | undefined

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            try {
                const raw = JSON.parse(reader.result as string) as unknown
                // 异步 import validation，校验失败会抛异常
                import('../save_load/validation.ts').then(({validateSaveData}) => {
                    try {
                        importedData = validateSaveData(raw)
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
        handlers.onStart(mode, importedData)
    }

    editBtn.addEventListener('click', () => dismiss('edit'))
    playBtn.addEventListener('click', () => dismiss('play'))
}
