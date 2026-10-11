import type {PanelContext} from '../../box/base/ui/index.ts'
import type {ItemEntityContext} from '../types.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {findItemDef, itemDisplayName, itemDisplayDescription} from '../../../inventory/items.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'

/** 掉落物编辑面板：只读展示 + 删除（掉落内容由拾取 / 世界逻辑驱动） */
export const createItemPanel = (ctx: Omit<ItemEntityContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('item-panel', 'entity.item_title')
    el.style.cssText += ';z-index:30'
    const info = document.createElement('div')
    info.className = 'dc-hint'
    el.appendChild(info)
    const {container: btnRow, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const refresh = (): void => {
        const id = ctx.getSelectedId()
        const e = id === undefined ? undefined : ctx.getById(id)
        if (e === undefined) return
        const def = findItemDef(e.defId)
        info.textContent = `${def === undefined ? e.defId : itemDisplayName(def)} ×${e.count}\n${def === undefined ? '' : itemDisplayDescription(def)}`
        info.style.whiteSpace = 'pre-line'
    }

    return {
        render: (container) => {
            container.appendChild(el)
            el.style.display = 'block'
            refresh()
            deleteBtn.onclick = () => {
                const id = ctx.getSelectedId()
                if (id !== undefined) ctx.remove(id)
            }
        },
        destroy: () => el.remove(),
        update: refresh,
    }
}
