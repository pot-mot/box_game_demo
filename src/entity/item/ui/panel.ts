import type {PanelContext} from '../../box/base/ui/index.ts'
import type {ItemEntityContext} from '../types.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {findItemDef} from '../../../inventory/items.ts'

/** 掉落物编辑面板：只读展示 + 删除（掉落内容由拾取 / 世界逻辑驱动） */
export const createItemPanel = (ctx: Omit<ItemEntityContext, 'panel'>): PanelContext => {
    const el = document.createElement('div')
    el.id = 'item-panel'
    el.style.cssText = [
        'position:fixed;bottom:24px;right:24px',
        'background:rgba(0,0,0,.78);color:#fff',
        'font:13px/1.5 monospace;padding:14px 18px',
        'border-radius:10px;min-width:200px;display:none;z-index:30',
    ].join(';')
    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#e9c46a'
    header.textContent = '掉落物'
    el.appendChild(header)
    const info = document.createElement('div')
    el.appendChild(info)
    const {container: btnRow, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const refresh = (): void => {
        const id = ctx.getSelectedId()
        const e = id === undefined ? undefined : ctx.getById(id)
        if (e === undefined) return
        const def = findItemDef(e.defId)
        info.textContent = `${def?.name ?? e.defId} ×${e.count}\n${def?.description ?? ''}`
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
