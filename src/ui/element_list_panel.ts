import type {EntityInfoSource, EntityPanelInfo} from '../entity/box/base/types/entity_info.ts'
import type {EntityType} from '../entity/constants.ts'
import {focusPanel} from './entity_control_panel.ts'
import {getInputRegistry} from '../input/registry.ts'
import {localizeText, localizeTitle} from '../i18n/dom.ts'
import type {StringLocaleKey} from '../i18n/index.ts'
import {createIcon} from './icons/icon.ts'

/** 实体列表分组标识（与展示名解耦，展示名走本地化） */
const ENTITY_GROUPS = ['character', 'box', 'area', 'terrain', 'building', 'fragment', 'interactable', 'item', 'other'] as const
type EntityGroup = typeof ENTITY_GROUPS[number]

/** 实体类型 → 列表分组的映射 */
const TYPE_GROUPS: Record<EntityType, EntityGroup> = {
    character: 'character',
    'box': 'box',
    'area': 'area',
    terrain: 'terrain',
    'building_generator': 'building',
    'fragment/common': 'fragment',
    'interactable': 'interactable',
    item: 'item',
}

const GROUP_LABELS: Record<EntityGroup, StringLocaleKey> = {
    character: 'element.group.character',
    box: 'element.group.box',
    area: 'element.group.area',
    terrain: 'element.group.terrain',
    building: 'element.group.building',
    fragment: 'element.group.fragment',
    interactable: 'element.group.interactable',
    item: 'element.group.item',
    other: 'element.group.other',
}

const createRow = (id: number, badgeLabel: string, badgeColor: string): HTMLElement => {
    const row = document.createElement('div')
    row.className = 'dc-list-row'
    row.dataset.id = String(id)

    const typeBadge = document.createElement('span')
    typeBadge.className = 'dc-list-badge'
    typeBadge.textContent = badgeLabel
    /* 徽章底色来自实体数据（阵营 / 类型色），非主题色 */
    typeBadge.style.background = badgeColor
    row.appendChild(typeBadge)

    const span = document.createElement('span')
    span.className = 'dc-list-info'
    row.appendChild(span)

    const btn = document.createElement('button')
    btn.className = 'dc-list-del ep-del'
    localizeTitle(btn, 'element.delete')
    btn.appendChild(createIcon('close', {size: 'sm'}))
    row.appendChild(btn)

    return row
}

const createGroupContainer = (group: EntityGroup): HTMLElement => {
    const c = document.createElement('div')
    c.className = 'dc-list'
    const h = document.createElement('div')
    h.className = 'dc-list-group-title'
    localizeText(h, GROUP_LABELS[group])
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
    el.className = 'dc-panel dc-scroll'
    el.style.cssText = 'position:fixed;top:120px;left:16px;padding:8px 12px;min-width:300px;max-height:60vh;user-select:none;'
    document.body.appendChild(el)

    const header = document.createElement('div')
    header.className = 'dc-panel__title'
    localizeText(header, 'element.title')
    el.appendChild(header)

    const list = document.createElement('div')
    list.className = 'dc-list'
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

    /** Delete：优先删除当前选中的元素；无选中时回退到指针悬停的列表项 */
    const tryDeleteSelected = (): void => {
        for (const source of sources) {
            const selectedId = source.getSelectedId()
            if (selectedId !== undefined) {
                source.remove(selectedId)
                return
            }
        }
        tryDeleteHovered()
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
    input.onActionDown('delete_entity', tryDeleteSelected)

    /** 需要按顺序渲染的分组 */
    const GROUP_ORDER: EntityGroup[] = ['character', 'box', 'area', 'terrain', 'building', 'fragment']
    /** 分组容器 */
    const groupContainers = new Map<EntityGroup, HTMLElement>()

    // 初始化分组容器
    for (const gn of GROUP_ORDER) {
        const c = createGroupContainer(gn)
        list.appendChild(c)
        groupContainers.set(gn, c)
    }

    return () => {
        const allItems: EntityPanelInfo[] = sources.flatMap(s => s.panelInfo)

        // 按键分组
        const itemsByGroup = new Map<EntityGroup, EntityPanelInfo[]>()
        for (const item of allItems) {
            const groupName = TYPE_GROUPS[item.type] ?? 'other'
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
                span.textContent = entry.rowTextOf !== undefined ? entry.rowTextOf() : entry.rowText

                const source = findSource(entry)
                const selId = source?.getSelectedId()
                row.classList.toggle('is-selected', entry.id === selId)
            }
        }

        if (allItems.length === 0) {
            if (!emptyEl) {
                emptyEl = document.createElement('div')
                emptyEl.className = 'dc-list-empty'
                localizeText(emptyEl, 'element.empty')
                list.appendChild(emptyEl)
            }
        } else if (emptyEl) {
            emptyEl.remove()
            emptyEl = undefined
        }
    }
}
