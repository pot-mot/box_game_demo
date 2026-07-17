import type {CommonContext} from '../common_box/types/physics.ts'
import type {DestructionContext} from '../destruction_box/types/destruction.ts'
import type {PanelContext} from '../types/ui.ts'
import type {DestructionPanelContext} from './destruction_panel.ts'
import type {WaterBoxContext, WaterPanelContext} from '../water_block/types/water.ts'

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
    typeBadge.style.background = type === 'C' ? '#448' : '#844'
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

export const setupElementPanel = (
    common: CommonContext,
    commonPanel: PanelContext,
    destruction: DestructionContext,
    destructionPanel: DestructionPanelContext,
    water: WaterBoxContext,
    waterPanel: WaterPanelContext,
): () => void => {
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

    const findItem = (id: number): {type: 'common' | 'destruction' | 'water'; item: any} | undefined => {
        const cb = common.getBoxes().find(b => b.id === id)
        if (cb) return {type: 'common', item: cb}
        const db = destruction.getBoxes().find(b => b.id === id)
        if (db) return {type: 'destruction', item: db}
        const wb = water.getBlocks().find(b => b.id === id)
        if (wb) return {type: 'water', item: wb}
        return undefined
    }

    list.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const row = target.closest<HTMLElement>('[data-id]')
        if (!row) return

        const id = Number(row.dataset.id)
        const found = findItem(id)
        if (!found) return

        if (target.classList.contains('ep-del')) {
            if (found.type === 'common') {
                common.removeBox(id)
                if (!common.getSelected()) commonPanel.hide()
            } else if (found.type === 'destruction') {
                destruction.remove(id)
                if (!destruction.getSelected()) destructionPanel.hide()
            } else {
                water.removeBlock(id)
                if (!water.getSelected()) waterPanel.hide()
            }
            return
        }

        if (found.type === 'common') {
            const pb = found.item
            common.selectBox(pb.id)
            destruction.select(undefined)
            water.selectBlock(undefined)
            destructionPanel.hide()
            waterPanel.hide()
            const rotDeg = {
                x: pb.mesh.rotation.x * 180 / Math.PI,
                y: pb.mesh.rotation.y * 180 / Math.PI,
                z: pb.mesh.rotation.z * 180 / Math.PI,
            }
            commonPanel.showForBox(pb.config, pb.mesh.position, rotDeg)
        } else if (found.type === 'destruction') {
            const db = found.item
            destruction.select(db.id)
            common.selectBox(undefined)
            water.selectBlock(undefined)
            commonPanel.hide()
            waterPanel.hide()
            destructionPanel.showForBox(db.config, db.health, db.config.maxHealth)
        } else {
            const wb = found.item
            water.selectBlock(wb.id)
            common.selectBox(undefined)
            destruction.select(undefined)
            commonPanel.hide()
            destructionPanel.hide()
            waterPanel.showForBox(wb.config, wb.mesh.position)
        }
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
            const found = findItem(hoveredId)
            if (found) {
                if (found.type === 'common') {
                    common.removeBox(hoveredId)
                    if (!common.getSelected()) commonPanel.hide()
                } else if (found.type === 'destruction') {
                    destruction.remove(hoveredId)
                    if (!destruction.getSelected()) destructionPanel.hide()
                } else {
                    water.removeBlock(hoveredId)
                    if (!water.getSelected()) waterPanel.hide()
                }
            }
            hoveredId = undefined
        }
    })

    return () => {
        const cBoxes = common.getBoxes().map(b => ({type: 'common' as const, box: b}))
        const dBoxes = destruction.getBoxes().map(b => ({type: 'destruction' as const, box: b}))
        const wBlocks = water.getBlocks().map(b => ({type: 'water' as const, box: b}))
        const allItems = [...cBoxes, ...dBoxes, ...wBlocks]

        for (const [key, row] of rows) {
            if (!allItems.some(b => key === `${b.type}-${b.box.id}`)) {
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
                if (entry.type === 'water') {
                    const badge = row.children[0] as HTMLElement
                    badge.style.background = '#484'
                }
                list.appendChild(row)
                rows.set(key, row)
            }

            const span = row.children[1] as HTMLElement
            if (entry.type === 'common') {
                span.textContent = formatInfo(entry.box.id, entry.box.mesh.position, entry.box.config)
            } else if (entry.type === 'destruction') {
                span.textContent = formatDestrInfo(entry.box.id, entry.box.mesh.position, entry.box.config, (entry.box as any).health)
            } else {
                span.textContent = formatWaterInfo(entry.box.id, entry.box.mesh.position, entry.box.config)
            }
            let selId: number | undefined
            if (entry.type === 'common') selId = common.selectedId
            else if (entry.type === 'destruction') selId = destruction.selectedId
            else selId = water.selectedId
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
