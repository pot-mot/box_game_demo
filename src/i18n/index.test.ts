import {describe, it, expect, beforeEach} from 'vitest'
import {getLocale, setLocale, translate, onLocaleChange} from './index.ts'
import {DEFAULT_LOCALE, STORAGE_KEY} from './constants.ts'

describe('i18n 运行时', () => {
    beforeEach(() => {
        localStorage.clear()
        setLocale(DEFAULT_LOCALE)
    })

    it('默认为中文', () => {
        expect(getLocale()).toBe('zh-cn')
        expect(translate('startup.mode.play')).toBe('游玩模式')
    })

    it('切换到英文后字符串键与参数键均取英文', () => {
        setLocale('en')
        expect(translate('startup.mode.play')).toBe('Play Mode')
        expect(translate({key: 'startup.imported', args: ['save.json']})).toBe('Imported: save.json')
        expect(translate({key: 'camera.zoom', args: ['1.00']})).toBe('zoom: 1.00')
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
