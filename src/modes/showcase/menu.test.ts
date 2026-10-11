import {describe, it, expect} from 'vitest'
import {createShowcaseMenu} from './menu.ts'
import {SHOWCASE_MODULES} from './modules/index.ts'

describe('展示模式：二级菜单', () => {
    it('每个子模块渲染一张卡片，点击卡片触发对应 onSelect', () => {
        const selected: string[] = []
        const menu = createShowcaseMenu(SHOWCASE_MODULES, id => selected.push(id))

        const cards = document.querySelectorAll<HTMLButtonElement>('.sch-menu-card')
        expect(cards.length).toBe(SHOWCASE_MODULES.length)

        cards[1]?.click()
        expect(selected).toEqual([SHOWCASE_MODULES[1]?.id])

        menu.dispose()
        expect(document.querySelector('.sch-menu')).toBeNull()
    })

    it('show / hide 切换菜单可见性', () => {
        const menu = createShowcaseMenu(SHOWCASE_MODULES, () => {})
        const overlay = document.querySelector<HTMLElement>('.sch-menu')
        expect(overlay).not.toBeNull()

        menu.hide()
        expect(overlay?.style.display).toBe('none')
        menu.show()
        expect(overlay?.style.display).toBe('flex')

        menu.dispose()
    })
})
