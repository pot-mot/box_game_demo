import {describe, it, expect, beforeEach} from 'vitest'
import {setLocale, translate, onLocaleChange} from './index.ts'
import {DEFAULT_LOCALE, STORAGE_KEY} from './constants.ts'

describe('i18n 运行时', () => {
    beforeEach(() => {
        localStorage.clear()
        setLocale(DEFAULT_LOCALE)
    })

    it('参数键按 args 插值', () => {
        setLocale('en')
        const text = translate({key: 'startup.imported', args: ['save.json']})
        expect(text).toContain('save.json')
    })

    it('切换语言会写入 localStorage', () => {
        setLocale('en')
        expect(localStorage.getItem(STORAGE_KEY)).toBe('en')
    })

    it('切换语言通知订阅者并可取消订阅', () => {
        let count = 0
        const off = onLocaleChange(() => { count++ })
        setLocale('en')
        expect(count).toBe(1)
        off()
        setLocale('zh-cn')
        expect(count).toBe(1)
    })

    it('同语言重复设置不触发通知', () => {
        let count = 0
        onLocaleChange(() => { count++ })
        setLocale('zh-cn')
        expect(count).toBe(0)
    })
})
