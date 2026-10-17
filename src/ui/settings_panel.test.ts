import {describe, it, expect, beforeEach} from 'vitest'
import {setupSettingsPanel} from './settings_panel.ts'

const findItem = (text: string): HTMLElement | undefined =>
    Array.from(document.querySelectorAll<HTMLElement>('#settings-menu .dc-menu-item'))
        .find(el => (el.textContent ?? '').includes(text))

describe('设置面板：手动存档菜单项', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        localStorage.clear()
    })

    it('提供回调时渲染「保存世界」项，点击触发回调并关闭菜单', () => {
        let saved = 0
        setupSettingsPanel(() => {}, undefined, undefined, () => { saved++ })
        const item = findItem('保存世界')
        expect(item).toBeDefined()
        item?.click()
        expect(saved).toBe(1)
        expect(document.querySelector<HTMLElement>('#settings-menu')?.style.display).toBe('none')
    })

    it('未提供回调时不渲染存档项', () => {
        setupSettingsPanel(() => {})
        expect(findItem('保存世界')).toBeUndefined()
    })
})
