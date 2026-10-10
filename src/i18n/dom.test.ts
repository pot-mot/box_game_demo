import {describe, it, expect, beforeEach} from 'vitest'
import {localizeText, localizeTitle, localizePlaceholder} from './dom.ts'
import {setLocale} from './index.ts'
import {DEFAULT_LOCALE} from './constants.ts'

describe('i18n DOM 助手', () => {
    beforeEach(() => {
        localStorage.clear()
        setLocale('zh-cn')
    })

    it('设置 textContent 并随语言切换重译', () => {
        const el = document.createElement('div')
        localizeText(el, 'startup.mode.edit')
        expect(el.textContent).toBe('编辑模式')
        setLocale('en')
        expect(el.textContent).toBe('Edit Mode')
    })

    it('设置 title 与 placeholder', () => {
        const titleEl = document.createElement('div')
        localizeTitle(titleEl, 'settings.title')
        const input = document.createElement('input')
        localizePlaceholder(input, 'input.capture_prompt')
        expect(titleEl.title).toBe('设置')
        expect(input.placeholder).toBe('请按键 / 鼠标键...')
        setLocale('en')
        expect(titleEl.title).toBe('Settings')
        expect(input.placeholder).toBe('Press a key / mouse button...')
    })

    it('默认语言常量为中文', () => {
        expect(DEFAULT_LOCALE).toBe('zh-cn')
    })
})
