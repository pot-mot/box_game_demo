import type {SpawnMode} from '../types/spawnMode.ts'

const MODES: SpawnMode[] = ['box/common', 'box/destruction', 'box/water', 'box/burning']
const MODE_LABELS: Record<SpawnMode, string> = {
    'box/common': 'Common',
    'box/destruction': 'Destruction',
    'box/water': 'Water',
    'box/burning': 'Burning',
}

export const setupSpawnModePanel = (getSpawnMode: () => SpawnMode, onSelectMode: (mode: SpawnMode) => void): () => void => {
    const container = document.createElement('div')
    container.id = 'spawn-mode-panel'
    container.style.cssText = [
        'position: fixed; top: 16px; left: 16px;',
        'font: 14px/1.6 monospace;',
        'min-width: 200px;',
        'user-select: none;',
        'z-index: 100;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = [
        'background: rgba(0,0,0,.7); color: #fff;',
        'padding: 8px 16px; border-radius: 8px;',
        'cursor: pointer;',
    ].join(' ')
    container.appendChild(header)

    const dropdown = document.createElement('div')
    dropdown.style.cssText = [
        'display: none;',
        'background: rgba(20,20,20,.95); color: #fff;',
        'border-radius: 0 0 8px 8px;',
        'overflow: hidden;',
    ].join(' ')

    const items: HTMLDivElement[] = MODES.map(mode => {
        const item = document.createElement('div')
        item.textContent = MODE_LABELS[mode]
        item.style.cssText = [
            'padding: 6px 16px; cursor: pointer;',
            'transition: background .15s;',
        ].join(' ')
        item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,.15)' })
        item.addEventListener('mouseleave', () => { item.style.background = '' })
        item.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation()
            onSelectMode(mode)
            close()
        })
        dropdown.appendChild(item)
        return item
    })
    container.appendChild(dropdown)
    document.body.appendChild(container)

    let open = false

    const openDropdown = (): void => {
        open = true
        header.style.borderRadius = '8px 8px 0 0'
        dropdown.style.display = 'block'
        const current = getSpawnMode()
        items.forEach((item, i) => {
            item.style.background = MODES[i] === current ? 'rgba(136,204,255,.3)' : ''
            item.style.fontWeight = MODES[i] === current ? 'bold' : 'normal'
        })
    }

    const close = (): void => {
        open = false
        header.style.borderRadius = '8px'
        dropdown.style.display = 'none'
    }

    header.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation()
        if (open) { close(); return }
        openDropdown()
    })

    document.addEventListener('click', (e: MouseEvent) => {
        if (open && !container.contains(e.target as Node)) {
            close()
        }
    })

    return () => {
        const mode = getSpawnMode()
        header.textContent = `▼ ${MODE_LABELS[mode]}`
        if (open) {
            items.forEach((item, i) => {
                item.style.background = MODES[i] === mode ? 'rgba(136,204,255,.3)' : ''
                item.style.fontWeight = MODES[i] === mode ? 'bold' : 'normal'
            })
        }
    }
}
