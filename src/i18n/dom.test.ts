import {describe, it, expect, beforeEach} from 'vitest'
import {localizeText, localizeTitle, localizePlaceholder} from './dom.ts'
import {setLocale} from './index.ts'

describe('i18n DOM 助手', () => {
    beforeEach(() => {
        localStorage.clear()
        setLocale('zh-cn')
    })

    it('localizeText 设置文本并在切换语言时原地重译', () => {
        const el = document.createElement('div')
        localizeText(el, 'startup.mode.edit')
        const zh = el.textContent
        expect(zh).toBeTruthy()
        setLocale('en')
        expect(el.textContent).toBeTruthy()
        expect(el.textContent).not.toBe(zh)
    })

    it('localizeTitle / localizePlaceholder 设置 title 与 placeholder 并随语言重译', () => {
        const titleEl = document.createElement('div')
        localizeTitle(titleEl, 'settings.title')
        const input = document.createElement('input')
        localizePlaceholder(input, 'input.capture_prompt')
        const zhTitle = titleEl.title
        const zhPlaceholder = input.placeholder
        expect(zhTitle).toBeTruthy()
        expect(zhPlaceholder).toBeTruthy()
        setLocale('en')
        expect(titleEl.title).toBeTruthy()
        expect(input.placeholder).toBeTruthy()
        expect(titleEl.title).not.toBe(zhTitle)
        expect(input.placeholder).not.toBe(zhPlaceholder)
    })
})
