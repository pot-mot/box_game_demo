import type {SpawnMode} from '../types/spawnMode.ts'
import {translate, type StringLocaleKey} from '../i18n/index.ts'
import {localizeText} from '../i18n/dom.ts'
import {createIcon} from './icons/icon.ts'

const MODES: SpawnMode[] = [
    'box',
    'area',
    'character',
    'terrain',
    'building_generator',
    'interactable',
    'diorama',
]
const MODE_LABELS: Record<SpawnMode, StringLocaleKey> = {
    'box': 'spawn.box',
    'area': 'spawn.area',
    'character': 'spawn.character',
    'terrain': 'spawn.terrain',
    'building_generator': 'spawn.building',
    'interactable': 'spawn.interactable',
    'diorama': 'spawn.diorama',
}

export const setupSpawnModePanel = (getSpawnMode: () => SpawnMode, onSelectMode: (mode: SpawnMode) => void): () => void => {
    const container = document.createElement('div')
    container.id = 'spawn-mode-panel'
    container.className = 'dc-dropdown'
    container.style.cssText = 'position: fixed; top: 16px; left: 16px; min-width: 200px; user-select: none; z-index: 100;'

    const header = document.createElement('div')
    header.className = 'dc-dropdown__header'
    header.appendChild(createIcon('chevron-down', {size: 'sm'}))
    const headerText = document.createElement('span')
    header.appendChild(headerText)
    container.appendChild(header)

    const dropdown = document.createElement('div')
    dropdown.className = 'dc-dropdown__menu'

    const items: HTMLDivElement[] = MODES.map(mode => {
        const item = document.createElement('div')
        item.className = 'dc-dropdown__item'
        localizeText(item, MODE_LABELS[mode])
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

    const syncActive = (): void => {
        const current = getSpawnMode()
        items.forEach((item, i) => {
            item.classList.toggle('is-active', MODES[i] === current)
        })
    }

    const openDropdown = (): void => {
        open = true
        header.classList.add('is-open')
        dropdown.style.display = 'block'
        syncActive()
    }

    const close = (): void => {
        open = false
        header.classList.remove('is-open')
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
        const text = translate(MODE_LABELS[getSpawnMode()])
        if (headerText.textContent !== text) headerText.textContent = text
        if (open) syncActive()
    }
}
