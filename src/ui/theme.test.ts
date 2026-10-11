import {describe, it, expect} from 'vitest'
import {themeColor} from './theme.ts'

describe('主题令牌读取', () => {
    it('令牌未定义时回退到 fallback', () => {
        /* happy-dom 不解析 theme.css 的自定义属性，此处验证回退路径 */
        expect(themeColor('--dc-gold', '#c9a24b')).toBe('#c9a24b')
    })

    it('读取已设置的自定义属性值', () => {
        document.documentElement.style.setProperty('--dc-test-token', '#123456')
        expect(themeColor('--dc-test-token', '#000000')).toBe('#123456')
        document.documentElement.style.removeProperty('--dc-test-token')
    })
})
