import type {InventoryState} from '../../../inventory/types.ts'
import {INVENTORY_CELL_PX} from '../../../inventory/types.ts'
import {findItemDef} from '../../../inventory/items.ts'

export interface GridRenderOptions {
    getInventory: () => InventoryState
    /** 物品按下（拖拽 / 选择） */
    onItemPointerDown: (ev: PointerEvent, instanceId: string) => void
    /** 物品双击（快速转移，用于双栏容器） */
    onItemDoubleClick?: (instanceId: string) => void
    selectedId?: string
    /** 空背包占位文案 */
    emptyHint?: string
}

/**
 * 把某个背包（玩家 / 箱子）渲染进容器：背景格线 + 俄罗斯方块形状物品。
 * 供背包面板与双栏容器面板共用，保证两处网格表现一致。
 */
export const renderInventoryGrid = (container: HTMLElement, options: GridRenderOptions): void => {
    const inv = options.getInventory()
    container.style.position = 'relative'
    container.style.width = `${inv.width * INVENTORY_CELL_PX}px`
    container.style.height = `${inv.height * INVENTORY_CELL_PX}px`
    container.replaceChildren()

    for (let y = 0; y < inv.height; y++) {
        for (let x = 0; x < inv.width; x++) {
            const c = document.createElement('div')
            c.style.cssText = `position:absolute;left:${x * INVENTORY_CELL_PX}px;top:${y * INVENTORY_CELL_PX}px;width:${INVENTORY_CELL_PX}px;height:${INVENTORY_CELL_PX}px;border:1px solid rgba(255,255,255,0.06);box-sizing:border-box`
            container.appendChild(c)
        }
    }

    for (const stack of inv.stacks) {
        if (stack.grid === undefined) continue
        const def = findItemDef(stack.defId)
        if (def === undefined) continue
        const el = document.createElement('div')
        el.dataset.instanceId = stack.instanceId
        el.style.cssText = `position:absolute;left:${stack.grid.x * INVENTORY_CELL_PX}px;top:${stack.grid.y * INVENTORY_CELL_PX}px;width:${def.shape[0].length * INVENTORY_CELL_PX}px;height:${def.shape.length * INVENTORY_CELL_PX}px;cursor:grab;background:rgba(255,255,255,0.04);border-radius:4px`
        if (options.selectedId === stack.instanceId) el.style.outline = '2px solid #e9c46a'
        el.title = `${def.name} ×${stack.count}`
        const label = document.createElement('div')
        label.textContent = def.name
        label.style.cssText = 'position:absolute;left:3px;top:2px;font-size:10px;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none'
        el.appendChild(label)
        el.addEventListener('pointerdown', (ev) => options.onItemPointerDown(ev, stack.instanceId))
        if (options.onItemDoubleClick !== undefined) {
            el.addEventListener('dblclick', () => options.onItemDoubleClick?.(stack.instanceId))
        }
        container.appendChild(el)
    }
}
