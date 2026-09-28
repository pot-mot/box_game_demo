import type {EquipSlot, InventoryState} from '../../../inventory/types.ts'
import {EQUIP_SLOTS, EQUIP_SLOT_LABELS, INVENTORY_CELL_PX} from '../../../inventory/types.ts'
import {findItemDef} from '../../../inventory/items.ts'
import {findStack} from '../../../inventory/inventory.ts'
import type {Placement} from '../../../inventory/types.ts'

export interface InventoryPanelCallbacks {
    getInventory: () => InventoryState
    /** 拖动到新格位（返回是否成功，失败由调用方负责刷新） */
    onMove: (instanceId: string, placement: Placement) => boolean
    onEquip: (instanceId: string, slot?: EquipSlot) => boolean
    onUnequip: (slot: EquipSlot) => boolean
    onDrop: (instanceId: string) => void
    /** 装备变化后回调（同步角色外观与数值） */
    onEquipmentChanged: () => void
}

export interface InventoryPanel {
    toggle: () => void
    setVisible: (visible: boolean) => void
    isVisible: () => boolean
    refresh: () => void
    /** 挂载模型预览画布（P4），置于环绕槽位之下 */
    attachPreview: (canvas: HTMLCanvasElement) => void
    /** 供 P4 预览画布挂载点（右侧容器） */
    readonly rightColumn: HTMLElement
    destroy: () => void
}

export const createInventoryPanel = (cb: InventoryPanelCallbacks): InventoryPanel => {
    const root = document.createElement('div')
    root.style.cssText = [
        'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
        'display:none', 'z-index:60', 'user-select:none',
        'background:rgba(18,18,22,0.96)', 'color:#eee',
        'font:13px/1.5 system-ui, sans-serif',
        'border:1px solid #444', 'border-radius:10px', 'padding:16px',
        'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
    ].join(';')

    const title = document.createElement('div')
    title.style.cssText = 'font-size:15px;font-weight:700;margin-bottom:10px;color:#e9c46a'
    title.textContent = '背包 / 装备'
    root.appendChild(title)

    const body = document.createElement('div')
    body.style.cssText = 'display:flex;gap:16px'
    root.appendChild(body)

    const gridWrap = document.createElement('div')
    gridWrap.style.cssText = 'position:relative;border:1px solid #333;background:rgba(0,0,0,0.35)'
    body.appendChild(gridWrap)

    const rightColumn = document.createElement('div')
    rightColumn.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:240px'
    body.appendChild(rightColumn)

    /* 模型预览宿主（P4：环绕式装备槽围绕其布局） */
    const previewHost = document.createElement('div')
    previewHost.style.cssText = 'position:relative;width:240px;height:300px;align-self:center'
    rightColumn.appendChild(previewHost)
    const slotsLayer = document.createElement('div')
    slotsLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    previewHost.appendChild(slotsLayer)

    const detail = document.createElement('div')
    detail.style.cssText = 'border-top:1px solid #333;margin-top:10px;padding-top:8px;min-height:60px'
    root.appendChild(detail)

    let visible = false
    let selectedId: string | undefined

    const cell = (x: number, y: number): number => y * cb.getInventory().width + x

    const renderGrid = (): void => {
        const inv = cb.getInventory()
        gridWrap.style.width = `${inv.width * INVENTORY_CELL_PX}px`
        gridWrap.style.height = `${inv.height * INVENTORY_CELL_PX}px`
        gridWrap.replaceChildren()
        /* 背景格线 */
        for (let y = 0; y < inv.height; y++) {
            for (let x = 0; x < inv.width; x++) {
                const c = document.createElement('div')
                c.style.cssText = `position:absolute;left:${x * INVENTORY_CELL_PX}px;top:${y * INVENTORY_CELL_PX}px;width:${INVENTORY_CELL_PX}px;height:${INVENTORY_CELL_PX}px;border:1px solid rgba(255,255,255,0.06);box-sizing:border-box`
                gridWrap.appendChild(c)
            }
        }
        void cell
        for (const stack of inv.stacks) {
            if (stack.grid === undefined) continue
            const def = findItemDef(stack.defId)
            if (def === undefined) continue
            const el = document.createElement('div')
            el.dataset.instanceId = stack.instanceId
            el.style.cssText = `position:absolute;left:${stack.grid.x * INVENTORY_CELL_PX}px;top:${stack.grid.y * INVENTORY_CELL_PX}px;width:${def.shape[0].length * INVENTORY_CELL_PX}px;height:${def.shape.length * INVENTORY_CELL_PX}px;cursor:grab`
            if (selectedId === stack.instanceId) el.style.outline = '2px solid #e9c46a'
            el.title = `${def.name} ×${stack.count}`
            const label = document.createElement('div')
            label.textContent = def.name
            label.style.cssText = 'position:absolute;left:2px;top:2px;font-size:10px;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none'
            el.appendChild(label)
            el.addEventListener('pointerdown', (ev) => {
                ev.stopPropagation()
                selectedId = stack.instanceId
                render()
                startDrag(ev, stack.instanceId, () => ({x: stack.grid!.x, y: stack.grid!.y, rot: stack.grid!.rot}))
            })
            gridWrap.appendChild(el)
        }
    }

    const SLOT_ANCHORS: Record<EquipSlot, {left: string; top: string}> = {
        head: {left: '50%', top: '2%'},
        chest: {left: '2%', top: '45%'},
        main_hand: {left: '78%', top: '38%'},
        off_hand: {left: '2%', top: '72%'},
        arms: {left: '78%', top: '62%'},
        legs: {left: '50%', top: '88%'},
    }

    const renderEquipment = (): void => {
        const inv = cb.getInventory()
        slotsLayer.replaceChildren()
        for (const slot of EQUIP_SLOTS) {
            const id = inv.equipment[slot]
            const stack = id !== undefined ? findStack(inv, id) : undefined
            const def = stack !== undefined ? findItemDef(stack.defId) : undefined
            const el = document.createElement('div')
            const anchor = SLOT_ANCHORS[slot]
            el.style.cssText = [
                'position:absolute', `left:${anchor.left}`, `top:${anchor.top}`, 'transform:translate(-50%,-50%)',
                'pointer-events:auto', 'cursor:pointer', 'width:110px',
                'padding:4px 6px', 'border:1px solid #555', 'border-radius:6px',
                'background:rgba(0,0,0,0.6)', 'font-size:11px', 'text-align:center', 'overflow:hidden',
                'text-overflow:ellipsis', 'white-space:nowrap',
            ].join(';')
            el.textContent = `${EQUIP_SLOT_LABELS[slot]}: ${def?.name ?? '—'}`
            el.title = `${EQUIP_SLOT_LABELS[slot]}: ${def?.name ?? '—'}`
            el.dataset.slot = slot
            el.addEventListener('click', () => {
                if (id !== undefined && cb.onUnequip(slot)) {
                    cb.onEquipmentChanged()
                    render()
                }
            })
            el.addEventListener('pointerup', (ev) => {
                const dragId = dragState?.instanceId
                if (dragId === undefined) return
                ev.stopPropagation()
                const ok = cb.onEquip(dragId, slot)
                endDrag()
                if (ok) cb.onEquipmentChanged()
                render()
            })
            slotsLayer.appendChild(el)
        }
    }

    const renderDetail = (): void => {
        detail.replaceChildren()
        const inv = cb.getInventory()
        const stack = selectedId !== undefined ? findStack(inv, selectedId) : undefined
        const def = stack !== undefined ? findItemDef(stack.defId) : undefined
        if (stack === undefined || def === undefined) {
            detail.textContent = '点击物品查看详情'
            return
        }
        const name = document.createElement('div')
        name.style.cssText = 'font-weight:700'
        name.textContent = `${def.name} ×${stack.count}`
        detail.appendChild(name)
        const desc = document.createElement('div')
        desc.style.cssText = 'color:#aaa'
        desc.textContent = def.description
        detail.appendChild(desc)
        const buttons = document.createElement('div')
        buttons.style.cssText = 'display:flex;gap:8px;margin-top:6px'
        const equipBtn = document.createElement('button')
        const equipped = Object.values(inv.equipment).includes(stack.instanceId)
        equipBtn.textContent = equipped ? '已装备' : '装备'
        equipBtn.disabled = equipped
        equipBtn.onclick = () => {
            const slot = def.equipSlot === 'head' || def.equipSlot === 'chest' || def.equipSlot === 'arms' || def.equipSlot === 'legs'
                ? def.equipSlot
                : 'main_hand'
            if (cb.onEquip(stack.instanceId, slot)) {
                cb.onEquipmentChanged()
                render()
            }
        }
        const dropBtn = document.createElement('button')
        dropBtn.textContent = '丢弃'
        dropBtn.onclick = () => {
            cb.onDrop(stack.instanceId)
            selectedId = undefined
            render()
        }
        buttons.appendChild(equipBtn)
        buttons.appendChild(dropBtn)
        detail.appendChild(buttons)
    }

    const render = (): void => {
        renderGrid()
        renderEquipment()
        renderDetail()
    }

    /* ── 拖拽 ── */
    interface DragState {
        instanceId: string
        rot: number
        offsetX: number
        offsetY: number
        ghost: HTMLElement
    }
    let dragState: DragState | undefined

    const startDrag = (
        ev: PointerEvent,
        instanceId: string,
        getPlacement: () => Placement,
    ): void => {
        const rect = gridWrap.getBoundingClientRect()
        const start = getPlacement()
        const ghost = document.createElement('div')
        ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:70;background:rgba(233,196,106,0.5);border:1px solid #e9c46a;border-radius:4px'
        document.body.appendChild(ghost)
        const state: DragState = {
            instanceId,
            rot: start.rot,
            offsetX: ev.clientX - rect.left - start.x * INVENTORY_CELL_PX,
            offsetY: ev.clientY - rect.top - start.y * INVENTORY_CELL_PX,
            ghost,
        }
        dragState = state
        const updateGhost = (): void => {
            const def = findItemDef(findStack(cb.getInventory(), instanceId)?.defId ?? '')
            const w = def?.shape[0].length ?? 1
            const h = def?.shape.length ?? 1
            ghost.style.width = `${w * INVENTORY_CELL_PX}px`
            ghost.style.height = `${h * INVENTORY_CELL_PX}px`
        }
        updateGhost()
        const onMove = (e: PointerEvent): void => {
            ghost.style.left = `${e.clientX - state.offsetX}px`
            ghost.style.top = `${e.clientY - state.offsetY}px`
        }
        onMove(ev)

        const onKey = (e: KeyboardEvent): void => {
            if (e.code !== 'KeyR') return
            state.rot = (state.rot + 1) % 4
            updateGhost()
        }

        const cleanup = (): void => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('keydown', onKey)
            ghost.remove()
            dragState = undefined
        }

        const onUp = (e: PointerEvent): void => {
            /* 释放到装备槽（槽位自身处理 pointerup 时 dragState 已清空，此处仅处理网格落位） */
            if (dragState !== state) { cleanup(); return }
            const r = gridWrap.getBoundingClientRect()
            const x = Math.round((e.clientX - r.left - state.offsetX) / INVENTORY_CELL_PX)
            const y = Math.round((e.clientY - r.top - state.offsetY) / INVENTORY_CELL_PX)
            cb.onMove(instanceId, {x, y, rot: state.rot as Placement['rot']})
            cleanup()
            render()
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('keydown', onKey)
    }

    const endDrag = (): void => {
        /* 供装备槽 pointerup 清理拖拽（拖拽清理由 startDrag 的异地 pointerup 兜底） */
        if (dragState !== undefined) {
            dragState.ghost.remove()
            dragState = undefined
        }
    }

    root.addEventListener('pointerdown', () => {
        /* 点击空白取消选择 */
        selectedId = undefined
        renderDetail()
    })

    const setVisible = (v: boolean): void => {
        visible = v
        root.style.display = v ? 'block' : 'none'
        if (v) render()
        else endDrag()
    }

    return {
        toggle: () => setVisible(!visible),
        setVisible,
        isVisible: () => visible,
        refresh: render,
        attachPreview: (canvas: HTMLCanvasElement) => {
            previewHost.insertBefore(canvas, slotsLayer)
        },
        rightColumn,
        destroy: () => {
            endDrag()
            root.remove()
        },
    }
}
