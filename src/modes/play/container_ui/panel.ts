import type {InventoryState, Placement} from '../../../inventory/types.ts'
import {INVENTORY_CELL_PX as CELL} from '../../../inventory/types.ts'
import {findItemDef, findStack, moveStack, transferStack} from '../../../inventory/index.ts'
import {renderInventoryGrid} from '../inventory_ui/grid_render.ts'

export interface ContainerPanelCallbacks {
    getPlayerInventory: () => InventoryState
    /** 任意移动 / 转移后回调（用于刷新外部 UI） */
    onChanged?: () => void
}

export interface ContainerPanel {
    /** 打开指定容器（箱子持有其 InventoryState 引用） */
    open: (container: InventoryState, title?: string) => void
    close: () => void
    isVisible: () => boolean
    refresh: () => void
    destroy: () => void
}

type PaneSide = 'player' | 'chest'

/**
 * 双栏容器面板：左侧玩家背包、右侧箱子，均为俄罗斯方块网格；
 * 支持栏内拖拽移动、跨栏拖拽存取、双击快速转移。
 */
export const createContainerPanel = (cb: ContainerPanelCallbacks): ContainerPanel => {
    const root = document.createElement('div')
    root.style.cssText = [
        'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
        'display:none', 'z-index:62', 'user-select:none',
        'background:rgba(18,18,22,0.96)', 'color:#eee',
        'font:13px/1.5 system-ui, sans-serif',
        'border:1px solid #444', 'border-radius:10px', 'padding:16px',
        'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
    ].join(';')

    const title = document.createElement('div')
    title.style.cssText = 'font-size:15px;font-weight:700;margin-bottom:10px;color:#e9c46a'
    title.textContent = '箱子'
    root.appendChild(title)

    const body = document.createElement('div')
    body.style.cssText = 'display:flex;gap:16px;align-items:flex-start'
    root.appendChild(body)

    const playerColumn = document.createElement('div')
    const chestColumn = document.createElement('div')
    for (const [col, label] of [[playerColumn, '背包'], [chestColumn, '箱子']] as const) {
        const head = document.createElement('div')
        head.textContent = label
        head.style.cssText = 'margin-bottom:6px;color:#8ecae6;font-weight:700'
        col.appendChild(head)
        col.style.cssText = 'display:flex;flex-direction:column'
        body.appendChild(col)
    }
    const playerGrid = document.createElement('div')
    playerGrid.style.cssText = 'border:1px solid #333;background:rgba(0,0,0,0.35)'
    playerColumn.appendChild(playerGrid)
    const chestGrid = document.createElement('div')
    chestGrid.style.cssText = 'border:1px solid #333;background:rgba(0,0,0,0.35)'
    chestColumn.appendChild(chestGrid)

    const hint = document.createElement('div')
    hint.style.cssText = 'border-top:1px solid #333;margin-top:10px;padding-top:8px;color:#aaa;min-height:18px'
    hint.textContent = '拖拽物品在背包与箱子间存取；双击快速转移；拖拽中按 R 旋转'
    root.appendChild(hint)

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '关闭'
    closeBtn.style.cssText = 'position:absolute;top:10px;right:12px;cursor:pointer'
    closeBtn.onclick = () => close()
    root.appendChild(closeBtn)

    let visible = false
    let chest: InventoryState | undefined

    const invOf = (side: PaneSide): InventoryState | undefined =>
        side === 'player' ? cb.getPlayerInventory() : chest

    const render = (): void => {
        renderInventoryGrid(playerGrid, {
            getInventory: cb.getPlayerInventory,
            onItemPointerDown: (ev, id) => startDrag(ev, id, 'player'),
            onItemDoubleClick: (id) => quickTransfer(id, 'player'),
        })
        if (chest !== undefined) {
            const c = chest
            renderInventoryGrid(chestGrid, {
                getInventory: () => c,
                onItemPointerDown: (ev, id) => startDrag(ev, id, 'chest'),
                onItemDoubleClick: (id) => quickTransfer(id, 'chest'),
            })
        }
    }

    const sync = (): void => {
        cb.onChanged?.()
        render()
    }

    const quickTransfer = (instanceId: string, from: PaneSide): void => {
        const src = invOf(from)
        const dst = invOf(from === 'player' ? 'chest' : 'player')
        if (src === undefined || dst === undefined) return
        if (transferStack(src, dst, instanceId)) sync()
    }

    interface DragState {
        instanceId: string
        from: PaneSide
        rot: number
        offsetX: number
        offsetY: number
        ghost: HTMLElement
    }
    let drag: DragState | undefined

    const startDrag = (ev: PointerEvent, instanceId: string, from: PaneSide): void => {
        ev.stopPropagation()
        const src = invOf(from)
        const stack = src !== undefined ? findStack(src, instanceId) : undefined
        if (stack?.grid === undefined) return
        const sourceGrid = from === 'player' ? playerGrid : chestGrid
        const rect = sourceGrid.getBoundingClientRect()
        const ghost = document.createElement('div')
        ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:70;background:rgba(233,196,106,0.5);border:1px solid #e9c46a;border-radius:4px'
        document.body.appendChild(ghost)
        drag = {
            instanceId,
            from,
            rot: stack.grid.rot,
            offsetX: ev.clientX - rect.left - stack.grid.x * CELL,
            offsetY: ev.clientY - rect.top - stack.grid.y * CELL,
            ghost,
        }
        const updateGhost = (): void => {
            const def = findItemDef(stack.defId)
            const w = def?.shape[0].length ?? 1
            const h = def?.shape.length ?? 1
            ghost.style.width = `${w * CELL}px`
            ghost.style.height = `${h * CELL}px`
        }
        updateGhost()
        const move = (e: PointerEvent): void => {
            ghost.style.left = `${e.clientX - drag!.offsetX}px`
            ghost.style.top = `${e.clientY - drag!.offsetY}px`
        }
        move(ev)
        const key = (e: KeyboardEvent): void => {
            if (e.code !== 'KeyR' || drag === undefined) return
            drag.rot = (drag.rot + 1) % 4
            updateGhost()
        }
        const cleanup = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            window.removeEventListener('keydown', key)
            ghost.remove()
            drag = undefined
        }
        const gridAt = (clientX: number, clientY: number): {side: PaneSide; placement: Placement} | undefined => {
            const candidates: Array<[PaneSide, HTMLElement]> = [['player', playerGrid], ['chest', chestGrid]]
            for (const [side, el] of candidates) {
                const r = el.getBoundingClientRect()
                if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue
                const x = Math.floor((clientX - r.left) / CELL)
                const y = Math.floor((clientY - r.top) / CELL)
                return {side, placement: {x, y, rot: drag!.rot as Placement['rot']}}
            }
            return undefined
        }
        const up = (e: PointerEvent): void => {
            if (drag === undefined || drag.instanceId !== instanceId) { cleanup(); return }
            const rot = drag.rot as Placement['rot']
            const target = gridAt(e.clientX, e.clientY)
            if (target !== undefined) {
                if (target.side === from) {
                    const inv = invOf(from)
                    if (inv !== undefined) moveStack(inv, instanceId, {x: target.placement.x, y: target.placement.y, rot})
                } else {
                    const srcInv = invOf(from)
                    const dstInv = invOf(target.side)
                    if (srcInv !== undefined && dstInv !== undefined) {
                        transferStack(srcInv, dstInv, instanceId, {x: target.placement.x, y: target.placement.y, rot})
                    }
                }
            }
            cleanup()
            sync()
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('keydown', key)
    }

    const close = (): void => {
        visible = false
        root.style.display = 'none'
        drag?.ghost.remove()
        drag = undefined
    }

    return {
        open: (container, titleText) => {
            chest = container
            title.textContent = titleText ?? '箱子'
            visible = true
            root.style.display = 'block'
            render()
        },
        close,
        isVisible: () => visible,
        refresh: () => { if (visible) render() },
        destroy: () => {
            close()
            root.remove()
        },
    }
}
