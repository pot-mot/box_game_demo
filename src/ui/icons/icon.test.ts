import {describe, it, expect, beforeEach} from 'vitest'
import {ICON_NAMES, ICON_SPRITE_ID, installIconSprite} from './sprite.ts'
import {createIcon} from './icon.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

describe('图标系统', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('图标名清单无重复', () => {
        expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
    })

    it('installIconSprite 幂等：只注入一个 sprite 且返回同一元素', () => {
        const first = installIconSprite()
        const second = installIconSprite()
        expect(first).toBe(second)
        expect(document.querySelectorAll(`#${ICON_SPRITE_ID}`)).toHaveLength(1)
        expect(document.querySelectorAll('symbol')).toHaveLength(ICON_NAMES.length)
    })

    it('每个图标名都有对应 symbol 且解析出非空路径', () => {
        installIconSprite()
        for (const name of ICON_NAMES) {
            const path = document.querySelector(`#dc-icon-${name} path`)
            expect(path).not.toBeNull()
            expect(path?.getAttribute('d') ?? '').not.toBe('')
        }
    })

    it('createIcon 生成引用 symbol 的 svg，默认装饰性', () => {
        const icon = createIcon('sword')
        expect(icon.namespaceURI).toBe(SVG_NS)
        expect(icon.getAttribute('class')).toBe('dc-icon')
        expect(icon.getAttribute('aria-hidden')).toBe('true')
        const use = icon.querySelector('use')
        expect(use?.getAttribute('href')).toBe('#dc-icon-sword')
    })

    it('createIcon 支持尺寸档与无障碍名称', () => {
        const icon = createIcon('heart', {size: 'lg', title: '生命值'})
        const classes = icon.getAttribute('class') ?? ''
        expect(classes).toContain('dc-icon')
        expect(classes).toContain('dc-icon--lg')
        expect(icon.getAttribute('role')).toBe('img')
        expect(icon.getAttribute('aria-label')).toBe('生命值')
        expect(icon.getAttribute('aria-hidden')).toBeNull()
    })
})
