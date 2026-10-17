import type {ParsedSaveData} from './validation.ts'

/** 弹出文件选择框，读取并校验存档后回调（含被跳过元素的明细） */
export const promptLoadFile = (onLoad: (parsed: ParsedSaveData) => void): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            try {
                if (typeof reader.result !== 'string') return
                const raw = JSON.parse(reader.result) as unknown
                import('./validation.ts').then(({parseSaveData}) => {
                    try {
                        onLoad(parseSaveData(raw))
                    } catch (err) {
                        console.warn('存档加载失败:', err)
                    }
                })
            } catch {
                console.warn('文件解析失败')
            }
        }
        reader.readAsText(file)
    }
    input.click()
}
