import type {EntityInfoSource, EntityPanelInfo} from '../entity/box/base/types/entity_info.ts'
import {focusPanel} from './panel.ts'

const ROW_STYLE = 'display:flex;align-items:center;gap:4px;padding:2px 4px;border-radius:4px;cursor:pointer'
const INFO_STYLE = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
const DEL_STYLE = 'background:none;border:none;color:#f66;cursor:pointer;font:14px/1 monospace;padding:0 4px'

const createRow = (id: number, badgeLabel: string, badgeColor: string): HTMLElement => {
    const row = document.createElement('div')
    row.style.cssText = ROW_STYLE
    row.dataset.id = String(id)

    const typeBadge = document.createElement('span')
    typeBadge.style.cssText = 'font-size:10px;padding:1px 4px;border-radius:3px;margin-right:4px'
    typeBadge.textContent = badgeLabel
    typeBadge.style.background = badgeColor
    typeBadge.style.color = '#fff'
    row.appendChild(typeBadge)

    const span = document.createElement('span')
    span.style.cssText = INFO_STYLE
    row.appendChild(span)

    const btn = document.createElement('button')
    btn.className = 'ep-del'
    btn.style.cssText = DEL_STYLE
    btn.title = 'Delete'
    btn.textContent = '×'
    row.appendChild(btn)

    return row
}

export const setupElementPanel = (sources: EntityInfoSource[]): () => void => {
    const sourcesByType = new Map(sources.map(s => [s.type, s]))

    // 订阅各数据源事件：当选中元素被删除时自动关闭面板
    for (const source of sources) {
        source.events.on('delete', (_id: number, wasSelected: boolean) => {
            if (wasSelected) focusPanel(undefined)
        })
    }

    const el = document.createElement('div')
    el.id = 'element-panel'
    el.style.cssText = [
        'position: fixed; top: 120px; left: 16px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 8px 12px;',
        'border-radius: 8px; min-width: 300px;',
        'max-height: 60vh; overflow-y: auto;',
        'user-select: none;',
    ].join(' ')
    document.body.appendChild(el)

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:4px;font-size:14px'
    header.textContent = 'Elements'
    el.appendChild(header)

    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:2px'
    el.appendChild(list)

    const rows = new Map<string, HTMLElement>()

    let emptyEl: HTMLElement | undefined

    const getRowKey = (entry: EntityPanelInfo): string => `${entry.type}-${entry.id}`

    const findSource = (entry: EntityPanelInfo): EntityInfoSource | undefined =>
        sourcesByType.get(entry.type)

    list.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const row = target.closest<HTMLElement>('[data-id]')
        if (!row) return

        const id = Number(row.dataset.id)
        const type = row.dataset.type as string
        const source = sourcesByType.get(type as any)
        if (!source) return

        const entry = rows.get(`${type}-${id}`)
        if (!entry) return

        if (target.classList.contains('ep-del')) {
            source.remove(id)
            return
        }

        sources.forEach(s => s.select(undefined))
        source.select(id)
        focusPanel(source.panel)
    })

    let hoveredId: number | undefined
    let hoveredType: string | undefined

    list.addEventListener('mouseover', (e: MouseEvent) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
        if (row) {
            hoveredId = Number(row.dataset.id)
            hoveredType = row.dataset.type
        } else {
            hoveredId = undefined
            hoveredType = undefined
        }
    })

    list.addEventListener('mouseout', () => {
        hoveredId = undefined
        hoveredType = undefined
    })

    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Delete' && hoveredId !== undefined && hoveredType !== undefined) {
            const source = sourcesByType.get(hoveredType as any)
            if (source) source.remove(hoveredId)
            hoveredId = undefined
            hoveredType = undefined
        }
    })

    return () => {
        const allItems: EntityPanelInfo[] = sources.flatMap(s => s.panelInfo)

        for (const [key, row] of rows) {
            if (!allItems.some(e => getRowKey(e) === key)) {
                row.remove()
                rows.delete(key)
            }
        }

        for (const entry of allItems) {
            const key = getRowKey(entry)
            let row = rows.get(key)
            if (!row) {
                row = createRow(entry.id, entry.badgeLabel, entry.badgeColor)
                row.dataset.type = entry.type
                list.appendChild(row)
                rows.set(key, row)
            }

            const span = row.children[1] as HTMLElement
            span.textContent = entry.rowText

            const source = findSource(entry)
            const selId = source?.getSelectedId()
            row.className = entry.id === selId ? 'ep-row ep-sel' : 'ep-row'
        }

        if (allItems.length === 0) {
            if (!emptyEl) {
                emptyEl = document.createElement('div')
                emptyEl.style.cssText = 'color:#888;padding:4px 0'
                emptyEl.textContent = 'No elements'
                list.appendChild(emptyEl)
            }
        } else if (emptyEl) {
            emptyEl.remove()
            emptyEl = undefined
        }
    }
}
