import {describe, it, expect} from 'vitest'
import {SHOWCASE_MODULE_IDS} from './module.ts'
import {SHOWCASE_MODULES} from './modules/index.ts'
import {translate} from '../../i18n/index.ts'

describe('展示模式：子模块注册表', () => {
    it('注册表与 id 常量一一对应且顺序一致', () => {
        expect(SHOWCASE_MODULES.map(m => m.id)).toEqual([...SHOWCASE_MODULE_IDS])
    })

    it('每个模块的标题 / 说明可本地化为非空文本，且提供 setup 函数', () => {
        for (const module of SHOWCASE_MODULES) {
            expect(translate(module.title).length).toBeGreaterThan(0)
            expect(translate(module.description).length).toBeGreaterThan(0)
            expect(typeof module.setup).toBe('function')
        }
    })

    it('模块 id 唯一', () => {
        const ids = SHOWCASE_MODULES.map(m => m.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
