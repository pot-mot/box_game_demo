import type {PhysicsContext} from '../types/physics.ts'
import type {PanelContext} from '../types/ui.ts'

const ROW_STYLE = 'display:flex;align-items:center;gap:4px;padding:2px 4px;border-radius:4px;cursor:pointer'
const INFO_STYLE = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
const DEL_STYLE = 'background:none;border:none;color:#f66;cursor:pointer;font:14px/1 monospace;padding:0 4px'

const createRow = (id: number): HTMLElement => {
    const row = document.createElement('div')
    row.style.cssText = ROW_STYLE
    row.dataset.id = String(id)

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

export const setupElementPanel = (physics: PhysicsContext, panel: PanelContext): () => void => {
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

    const rows = new Map<number, HTMLElement>()

    let emptyEl: HTMLElement | undefined

    list.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const row = target.closest<HTMLElement>('[data-id]')
        if (!row) return

        const id = Number(row.dataset.id)

        if (target.classList.contains('ep-del')) {
            physics.removeBox(id)
            if (!physics.getSelected()) panel.hide()
            return
        }

        const pb = physics.getBoxes().find(b => b.id === id)
        if (!pb) return
        physics.selectBox(pb.id)
        const rotDeg = {
            x: pb.mesh.rotation.x * 180 / Math.PI,
            y: pb.mesh.rotation.y * 180 / Math.PI,
            z: pb.mesh.rotation.z * 180 / Math.PI,
        }
        panel.showForBox(pb.config, pb.mesh.position, rotDeg)
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
            physics.removeBox(hoveredId)
            if (!physics.getSelected()) panel.hide()
            hoveredId = undefined
        }
    })

    return () => {
        const boxes = physics.getBoxes()
        const selectedId = physics.selectedId

        // 清除多余行
        for (const [id, row] of rows) {
            if (!boxes.some(b => b.id === id)) {
                row.remove()
                rows.delete(id)
            }
        }

        for (const b of boxes) {
            let row = rows.get(b.id)
            if (!row) {
                row = createRow(b.id)
                list.appendChild(row)
                rows.set(b.id, row)
            }

            const span = row.firstElementChild!
            span.textContent = formatInfo(b.id, b.mesh.position, b.config)
            row.className = b.id === selectedId ? 'ep-row ep-sel' : 'ep-row'
        }

        if (boxes.length === 0) {
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
