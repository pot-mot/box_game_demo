import type {InventoryState} from '../../../inventory/types.ts'
import {INVENTORY_CELL_PX} from '../../../inventory/types.ts'
import {findItemDef, itemDisplayName} from '../../../inventory/items.ts'
import {createIcon} from '../../../ui/icons/icon.ts'

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
            c.style.cssText = `position:absolute;left:${x * INVENTORY_CELL_PX}px;top:${y * INVENTORY_CELL_PX}px;width:${INVENTORY_CELL_PX}px;height:${INVENTORY_CELL_PX}px;border:1px solid var(--dc-border);box-sizing:border-box`
            container.appendChild(c)
        }
    }

    for (const stack of inv.stacks) {
        if (stack.grid === undefined) continue
        const def = findItemDef(stack.defId)
        if (def === undefined) continue
        const w = def.shape[0].length * INVENTORY_CELL_PX
        const h = def.shape.length * INVENTORY_CELL_PX
        const el = document.createElement('div')
        el.dataset.instanceId = stack.instanceId
        el.style.cssText = `position:absolute;left:${stack.grid.x * INVENTORY_CELL_PX}px;top:${stack.grid.y * INVENTORY_CELL_PX}px;width:${w}px;height:${h}px;cursor:grab;overflow:hidden;background:color-mix(in srgb, var(--dc-gold) 12%, transparent);border-radius:var(--dc-radius-sm)`
        if (options.selectedId === stack.instanceId) el.style.outline = '2px solid var(--dc-gold)'
        el.title = `${itemDisplayName(def)} ×${stack.count}`
        /* 物品图标：居中于形状包围盒，尺寸随最小边长缩放 */
        const icon = createIcon(def.icon)
        const iconPx = Math.round(Math.min(def.shape[0].length, def.shape.length) * INVENTORY_CELL_PX * 0.56)
        icon.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${iconPx}px;height:${iconPx}px;color:var(--dc-gold-bright)`
        el.appendChild(icon)
        const label = document.createElement('div')
        label.textContent = itemDisplayName(def)
        label.style.cssText = 'position:absolute;left:0;right:0;bottom:1px;padding:0 2px;font-size:10px;line-height:1.15;text-align:center;color:var(--dc-text);text-shadow:0 1px 2px var(--dc-overlay);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
        el.appendChild(label)
        if (stack.count > 1) {
            const count = document.createElement('div')
            count.textContent = `${stack.count}`
            count.style.cssText = 'position:absolute;right:1px;top:1px;min-width:12px;padding:0 2px;box-sizing:border-box;font-size:10px;font-weight:700;line-height:1.3;text-align:center;color:var(--dc-gold-bright);background:var(--dc-overlay);border-radius:var(--dc-radius-sm);pointer-events:none'
            el.appendChild(count)
        }
        el.addEventListener('pointerdown', (ev) => options.onItemPointerDown(ev, stack.instanceId))
        if (options.onItemDoubleClick !== undefined) {
            el.addEventListener('dblclick', () => options.onItemDoubleClick?.(stack.instanceId))
        }
        container.appendChild(el)
    }
}
