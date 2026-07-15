import type {CommonContext} from '../common_box/types/physics.ts'
import type {DestructionContext} from '../destruction_box/types/destruction.ts'
import type {PanelContext} from '../types/ui.ts'
import type {DestructionPanelContext} from './destruction_panel.ts'

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

export const setupElementPanel = (
    common: CommonContext,
    commonPanel: PanelContext,
    destruction: DestructionContext,
    destructionPanel: DestructionPanelContext,
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

    const findBox = (id: number): {type: 'common' | 'destruction'; box: any} | undefined => {
        const cb = common.getBoxes().find(b => b.id === id)
        if (cb) return {type: 'common', box: cb}
        const db = destruction.getBoxes().find(b => b.id === id)
        if (db) return {type: 'destruction', box: db}
        return undefined
    }

    list.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const row = target.closest<HTMLElement>('[data-id]')
        if (!row) return

        const id = Number(row.dataset.id)
        const found = findBox(id)
        if (!found) return

        if (target.classList.contains('ep-del')) {
            if (found.type === 'common') {
                common.removeBox(id)
                if (!common.getSelected()) commonPanel.hide()
            } else {
                destruction.remove(id)
                if (!destruction.getSelected()) destructionPanel.hide()
            }
            return
        }

        if (found.type === 'common') {
            const pb = found.box
            common.selectBox(pb.id)
            destruction.select(undefined)
            destructionPanel.hide()
            const rotDeg = {
                x: pb.mesh.rotation.x * 180 / Math.PI,
                y: pb.mesh.rotation.y * 180 / Math.PI,
                z: pb.mesh.rotation.z * 180 / Math.PI,
            }
            commonPanel.showForBox(pb.config, pb.mesh.position, rotDeg)
        } else {
            const db = found.box
            destruction.select(db.id)
            common.selectBox(undefined)
            commonPanel.hide()
            destructionPanel.showForBox(db.config, db.health, db.config.maxHealth)
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
            const found = findBox(hoveredId)
            if (found) {
                if (found.type === 'common') {
                    common.removeBox(hoveredId)
                    if (!common.getSelected()) commonPanel.hide()
                } else {
                    destruction.remove(hoveredId)
                    if (!destruction.getSelected()) destructionPanel.hide()
                }
            }
            hoveredId = undefined
        }
    })

    return () => {
        const cBoxes = common.getBoxes().map(b => ({type: 'common' as const, box: b}))
        const dBoxes = destruction.getBoxes().map(b => ({type: 'destruction' as const, box: b}))
        const allBoxes = [...cBoxes, ...dBoxes]

        for (const [key, row] of rows) {
            if (!allBoxes.some(b => key === `${b.type}-${b.box.id}`)) {
                row.remove()
                rows.delete(key)
            }
        }

        for (const entry of allBoxes) {
            const key = `${entry.type}-${entry.box.id}`
            let row = rows.get(key)
            if (!row) {
                row = createRow(entry.box.id, entry.type === 'common' ? 'C' : 'D')
                list.appendChild(row)
                rows.set(key, row)
            }

            const span = row.children[1] as HTMLElement
            if (entry.type === 'common') {
                span.textContent = formatInfo(entry.box.id, entry.box.mesh.position, entry.box.config)
            } else {
                span.textContent = formatDestrInfo(entry.box.id, entry.box.mesh.position, entry.box.config, (entry.box as any).health)
            }
            const selId = entry.type === 'common' ? common.selectedId : destruction.selectedId
            row.className = entry.box.id === selId ? 'ep-row ep-sel' : 'ep-row'
        }

        if (allBoxes.length === 0) {
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
