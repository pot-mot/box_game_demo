import type {CommonEntityContext, CommonBox} from '../entity/box/common/types'
import type {DestructionEntityContext, DestructibleBox} from '../entity/box/destructed/types'
import type {WaterEntityContext, WaterBlock} from '../entity/box/water/types'
import {focusPanel} from './panel.ts'

type EntityEntry =
    | {type: 'common'; box: CommonBox}
    | {type: 'destruction'; box: DestructibleBox}
    | {type: 'water'; box: WaterBlock}

const ROW_STYLE = 'display:flex;align-items:center;gap:4px;padding:2px 4px;border-radius:4px;cursor:pointer'
const INFO_STYLE = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
const DEL_STYLE = 'background:none;border:none;color:#f66;cursor:pointer;font:14px/1 monospace;padding:0 4px'

const createRow = (id: number, type: string): HTMLElement => {
    const row = document.createElement('div')
    row.style.cssText = ROW_STYLE
    row.dataset.id = String(id)

    const typeBadge = document.createElement('span')
    typeBadge.style.cssText = 'font-size:10px;padding:1px 4px;border-radius:3px;margin-right:4px'
    typeBadge.textContent = type
    typeBadge.style.background = type === 'C' ? '#448' : type === 'W' ? '#484' : '#844'
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

const formatInfo = (id: number, p: {x: number; y: number; z: number}, c: {width: number; height: number; depth: number; mass: number}): string =>
    `#${id}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ${c.width}×${c.height}×${c.depth}  m:${c.mass}`

const formatDestrInfo = (id: number, p: {x: number; y: number; z: number}, c: {width: number; height: number; depth: number; mass: number; maxHealth: number}, health: number): string =>
    `#${id}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ${c.width}×${c.height}×${c.depth}  HP:${health.toFixed(0)}/${c.maxHealth}`

const formatWaterInfo = (id: number, p: {x: number; y: number; z: number}, c: {width: number; height: number; depth: number}): string =>
    `#${id}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ${c.width}×${c.height}×${c.depth}`

const fillRow = (row: HTMLElement, entry: EntityEntry): void => {
    const span = row.children[1] as HTMLElement
    if (entry.type === 'common') {
        span.textContent = formatInfo(entry.box.id, entry.box.mesh.position, entry.box.config)
    } else if (entry.type === 'destruction') {
        span.textContent = formatDestrInfo(entry.box.id, entry.box.mesh.position, entry.box.config, entry.box.health)
    } else {
        span.textContent = formatWaterInfo(entry.box.id, entry.box.mesh.position, entry.box.config)
    }
}

const getSelId = (entry: EntityEntry): number | undefined => {
    if (entry.type === 'common') return commonCtx.getSelectedId()
    if (entry.type === 'destruction') return destrCtx.getSelectedId()
    return waterCtx.getSelectedId()
}

let commonCtx: CommonEntityContext
let destrCtx: DestructionEntityContext
let waterCtx: WaterEntityContext

export const setupElementPanel = (
    common: CommonEntityContext,
    destruction: DestructionEntityContext,
    water: WaterEntityContext,
): () => void => {
    commonCtx = common
    destrCtx = destruction
    waterCtx = water

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

    const findEntry = (id: number): EntityEntry | undefined => {
        const cb = common.getAll().find(b => b.id === id)
        if (cb) return {type: 'common', box: cb}
        const db = destruction.getAll().find(b => b.id === id)
        if (db) return {type: 'destruction', box: db}
        const wb = water.getAll().find(b => b.id === id)
        if (wb) return {type: 'water', box: wb}
        return undefined
    }

    const focusEntry = (entry: EntityEntry): void => {
        common.select(undefined)
        destruction.select(undefined)
        water.select(undefined)
        if (entry.type === 'common') common.select(entry.box.id)
        else if (entry.type === 'destruction') destruction.select(entry.box.id)
        else water.select(entry.box.id)
        focusPanel(entry.type === 'common' ? common.panel
            : entry.type === 'destruction' ? destruction.panel
            : water.panel)
    }

    list.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const row = target.closest<HTMLElement>('[data-id]')
        if (!row) return

        const id = Number(row.dataset.id)
        const entry = findEntry(id)
        if (!entry) return

        if (target.classList.contains('ep-del')) {
            const wasSelected = getSelId(entry) === id
            if (entry.type === 'common') common.remove(id)
            else if (entry.type === 'destruction') destruction.remove(id)
            else water.remove(id)
            if (wasSelected) focusPanel(undefined)
            return
        }

        focusEntry(entry)
    })

    let hoveredId: number | undefined

    list.addEventListener('mouseover', (e: MouseEvent) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
        hoveredId = row ? Number(row.dataset.id) : undefined
    })

    list.addEventListener('mouseout', () => {
        hoveredId = undefined
    })

    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Delete' && hoveredId !== undefined) {
            const entry = findEntry(hoveredId)
            if (entry) {
                const wasSelected = getSelId(entry) === hoveredId
                if (entry.type === 'common') common.remove(hoveredId)
                else if (entry.type === 'destruction') destruction.remove(hoveredId)
                else water.remove(hoveredId)
                if (wasSelected) focusPanel(undefined)
            }
            hoveredId = undefined
        }
    })

    return () => {
        const allItems: EntityEntry[] = [
            ...common.getAll().map(b => ({type: 'common' as const, box: b})),
            ...destruction.getAll().map(b => ({type: 'destruction' as const, box: b})),
            ...water.getAll().map(b => ({type: 'water' as const, box: b})),
        ]

        for (const [key, row] of rows) {
            if (!allItems.some(e => key === `${e.type}-${e.box.id}`)) {
                row.remove()
                rows.delete(key)
            }
        }

        for (const entry of allItems) {
            const key = `${entry.type}-${entry.box.id}`
            let row = rows.get(key)
            if (!row) {
                const typeLabel = entry.type === 'common' ? 'C' : entry.type === 'destruction' ? 'D' : 'W'
                row = createRow(entry.box.id, typeLabel)
                list.appendChild(row)
                rows.set(key, row)
            }

            fillRow(row, entry)
            const selId = getSelId(entry)
            row.className = entry.box.id === selId ? 'ep-row ep-sel' : 'ep-row'
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
