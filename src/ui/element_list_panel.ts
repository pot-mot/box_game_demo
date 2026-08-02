import type {EntityInfoSource, EntityPanelInfo} from '../entity/box/base/types/entity_info.ts'
import type {EntityType} from '../entity/constants.ts'
import {focusPanel} from './entity_control_panel.ts'
import {getInputRegistry} from '../input/registry.ts'

const ROW_STYLE = 'display:flex;align-items:center;gap:4px;padding:2px 4px;border-radius:4px;cursor:pointer'
const INFO_STYLE = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
const DEL_STYLE = 'background:none;border:none;color:#f66;cursor:pointer;font:14px/1 monospace;padding:0 4px'
const GROUP_HEADER_STYLE = 'font-size:11px;font-weight:700;color:#aaa;padding:4px 4px 0 4px;margin-top:4px;border-top:1px solid #333'

/** 实体类型 → 列表分组的映射 */
const TYPE_GROUPS = {
    character: 'Character',
    'box/common': 'Box',
    'box/destruction': 'Box',
    'box/burning': 'Box',
    'box/magnet': 'Box',
    'box/elasticity': 'Box',
    'area/water': 'Area',
    terrain: 'Terrain',
    'fragment/common': 'Fragment',
} as const satisfies Record<EntityType, string>

const createRow = (id: number, badgeLabel: string, badgeColor: string): HTMLElement => {
    const row = document.createElement('div')
    row.style.cssText = ROW_STYLE
    row.dataset.id = String(id)

    /* hover 效果替代 .ep-row:hover */
    row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(255,255,255,.1)'
    })
    row.addEventListener('mouseleave', () => {
        /* 选中状态由外部设置 background，leave 时仅恢复非选中默认 */
        if (row.style.background === 'rgba(255,255,255,.1)') {
            row.style.background = ''
        }
    })

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

const createGroupContainer = (label: string): HTMLElement => {
    const c = document.createElement('div')
    c.style.cssText = 'display:flex;flex-direction:column;gap:2px'
    const h = document.createElement('div')
    h.style.cssText = GROUP_HEADER_STYLE
    h.textContent = label
    c.appendChild(h)
    return c
}

export const setupElementListPanel = (sources: EntityInfoSource[]): () => void => {
    const sourcesByType = new Map(sources.map(s => [s.type, s]))

    for (const source of sources) {
        source.events.on('delete', (_id: number, wasSelected: boolean) => {
            if (wasSelected) focusPanel(undefined)
        })
    }

    const el = document.createElement('div')
    el.id = 'element-list-panel'
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
    list.style.cssText = 'display:flex;flex-direction:column'
    el.appendChild(list)

    const rows = new Map<string, HTMLElement>()

    let emptyEl: HTMLElement | undefined

    const getRowKey = (entry: EntityPanelInfo): string => `${entry.type}-${entry.id}`

    const findSource = (entry: EntityPanelInfo): EntityInfoSource | undefined =>
        sourcesByType.get(entry.type)

    const tryDeleteHovered = (): void => {
        if (hoveredId !== undefined && hoveredType !== undefined) {
            const source = sourcesByType.get(hoveredType)
            if (source) {
                source.remove(hoveredId)
                hoveredId = undefined
                hoveredType = undefined
            }
        }
    }

    list.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const row = target.closest<HTMLElement>('[data-id]')
        if (!row) return

        const id = Number(row.dataset.id)
        const type = row.dataset.type! as EntityType
        const source = sourcesByType.get(type)
        if (!source) return

        if (target.classList.contains('ep-del')) {
            source.remove(id)
            return
        }

        sources.forEach(s => s.select(undefined))
        source.select(id)
        focusPanel(source.panel)
    })

    let hoveredId: number | undefined
    let hoveredType: EntityType | undefined

    list.addEventListener('mouseover', (e: MouseEvent) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
        if (row) {
            hoveredId = Number(row.dataset.id)
            hoveredType = row.dataset.type! as EntityType
        } else {
            hoveredId = undefined
            hoveredType = undefined
        }
    })

    list.addEventListener('mouseout', () => {
        hoveredId = undefined
        hoveredType = undefined
    })

    const input = getInputRegistry()
    input.onActionDown('delete_entity', tryDeleteHovered)

    /** 需要按顺序渲染的分组 */
    const GROUP_ORDER = ['Character', 'Box', 'Area', 'Terrain', 'Fragment']
    /** 分组容器 */
    const groupContainers = new Map<string, HTMLElement>()

    // 初始化分组容器
    for (const gn of GROUP_ORDER) {
        const c = createGroupContainer(gn)
        list.appendChild(c)
        groupContainers.set(gn, c)
    }

    return () => {
        const allItems: EntityPanelInfo[] = sources.flatMap(s => s.panelInfo)

        // 按键分组
        const itemsByGroup = new Map<string, EntityPanelInfo[]>()
        for (const item of allItems) {
            const groupName = TYPE_GROUPS[item.type] ?? 'Other'
            let arr = itemsByGroup.get(groupName)
            if (!arr) { arr = []; itemsByGroup.set(groupName, arr) }
            arr.push(item)
        }

        // 清理已移除的行
        for (const [key, row] of rows) {
            if (!allItems.some(e => getRowKey(e) === key)) {
                row.remove()
                rows.delete(key)
            }
        }

        // 渲染每个分组
        for (const groupName of GROUP_ORDER) {
            const items = itemsByGroup.get(groupName)
            const container = groupContainers.get(groupName)!
            container.style.display = (items && items.length > 0) ? '' : 'none'

            if (!items || items.length === 0) continue

            for (const entry of items) {
                const key = getRowKey(entry)
                let row = rows.get(key)
                if (!row) {
                    row = createRow(entry.id, entry.badgeLabel, entry.badgeColor)
                    row.dataset.type = entry.type
                    container.appendChild(row)
                    rows.set(key, row)
                }

                const span = row.children[1] as HTMLElement
                span.textContent = entry.rowText

                const source = findSource(entry)
                const selId = source?.getSelectedId()
                row.style.background = entry.id === selId ? 'rgba(100,180,255,.25)' : ''
            }
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
