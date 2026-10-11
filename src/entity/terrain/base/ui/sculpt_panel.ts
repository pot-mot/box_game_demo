import type {TerrainSculpt} from '../edit/sculpt.ts'
import type {SourceEmitter} from '../../../box/base/types/event_emitter.ts'
import {localizeText} from '../../../../i18n/dom.ts'

/** 地形雕刻面板所需的地形源最小接口（便于测试注入，避免依赖完整 `TerrainContext`） */
export interface TerrainSculptPanelSource {
    getSelectedId: () => number | undefined
    readonly events: SourceEmitter
}

/**
 * 地形雕刻面板（编辑模式）：仅当选中某个地形时显示，含「启用雕刻」复选框。
 * 取消选中时隐藏并强制关闭雕刻（避免无 UI 可操作却仍拦截滚轮）。
 * 启用时通过 `onToggle` 通知编辑模式关闭相机滚轮缩放（保留旋转 / 平移与实体选中）。
 */
export const setupTerrainSculptPanel = (
    sculpt: TerrainSculpt,
    terrainSources: readonly TerrainSculptPanelSource[],
    onToggle: (enabled: boolean) => void,
): (() => void) => {
    const container = document.createElement('div')
    container.id = 'terrain-sculpt-panel'
    container.className = 'dc-panel'
    container.style.cssText = 'position:fixed;bottom:24px;left:16px;display:none;padding:10px 14px;min-width:200px;user-select:none;'

    const header = document.createElement('div')
    header.className = 'dc-panel__title'
    localizeText(header, 'entity.terrain_sculpt_title')
    container.appendChild(header)

    const enableRow = document.createElement('label')
    enableRow.className = 'dc-label'
    enableRow.style.cssText = 'display:block;margin-top:6px'
    const enableCheckbox = document.createElement('input')
    enableCheckbox.type = 'checkbox'
    enableCheckbox.className = 'dc-check'
    enableCheckbox.id = 'terrain-sculpt-enable'
    enableRow.appendChild(enableCheckbox)
    const enableText = document.createElement('span')
    localizeText(enableText, 'entity.terrain_sculpt_enable')
    enableRow.appendChild(enableText)
    container.appendChild(enableRow)

    enableCheckbox.addEventListener('change', () => {
        sculpt.setEnabled(enableCheckbox.checked)
        onToggle(enableCheckbox.checked)
    })

    const hasSelection = (): boolean => terrainSources.some(ts => ts.getSelectedId() !== undefined)

    const setVisible = (visible: boolean): void => {
        container.style.display = visible ? '' : 'none'
        if (visible) return
        enableCheckbox.checked = false
        if (sculpt.isEnabled()) {
            sculpt.setEnabled(false)
            onToggle(false)
        }
    }

    const unsubscribers = terrainSources.map(ts => ts.events.on('select', () => { setVisible(hasSelection()) }))

    document.body.appendChild(container)
    setVisible(hasSelection())

    return () => {
        for (const unsubscribe of unsubscribers) unsubscribe()
        container.remove()
    }
}
