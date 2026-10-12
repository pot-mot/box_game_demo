import {describe, it, expect, beforeEach} from 'vitest'
import {renderInventoryGrid} from './grid_render.ts'
import {addItem, createInventory} from '../../../inventory/index.ts'

describe('背包网格渲染', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('每个物品渲染专属图标 svg（背包 / 容器共用）', () => {
        const inv = createInventory()
        addItem(inv, 'weapon_short_sword', 1)
        addItem(inv, 'material_stone', 3)
        const host = document.createElement('div')
        document.body.appendChild(host)

        renderInventoryGrid(host, {getInventory: () => inv, onItemPointerDown: () => {}})

        const icons = Array.from(host.querySelectorAll('svg.dc-icon'))
        const hrefs = icons.map(icon => icon.querySelector('use')?.getAttribute('href'))
        expect(hrefs).toContain('#dc-icon-item-short-sword')
        expect(hrefs).toContain('#dc-icon-item-stone')
    })

    it('堆叠数量大于 1 时显示数量角标', () => {
        const inv = createInventory()
        addItem(inv, 'material_stone', 3)
        const host = document.createElement('div')
        document.body.appendChild(host)

        renderInventoryGrid(host, {getInventory: () => inv, onItemPointerDown: () => {}})

        const item = host.querySelector<HTMLElement>('[data-instance-id]')
        expect(item?.textContent).toContain('3')
    })
})
