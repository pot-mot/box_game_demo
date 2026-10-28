import {describe, it, expect} from 'vitest'
import {
    DEFAULT_SHOWCASE_FORM_SPACING,
    SHOWCASE_WYVERN_SPACING_SCALE,
    showcaseFormSpacingOf,
} from './constants.ts'

describe('展示模式：体形间距配置', () => {
    it('人 / 狼 / 马共用默认间距', () => {
        for (const bodyFormId of ['humanoid', 'wolf', 'horse']) {
            expect(showcaseFormSpacingOf(bodyFormId)).toEqual(DEFAULT_SHOWCASE_FORM_SPACING)
        }
    })

    it('龙的 x / z 间距均放大到默认值的 1.5 倍', () => {
        const wyvern = showcaseFormSpacingOf('wyvern')
        expect(wyvern.x).toBeCloseTo(DEFAULT_SHOWCASE_FORM_SPACING.x * SHOWCASE_WYVERN_SPACING_SCALE)
        expect(wyvern.z).toBeCloseTo(DEFAULT_SHOWCASE_FORM_SPACING.z * SHOWCASE_WYVERN_SPACING_SCALE)
    })

    it('未知体形安全回退默认间距', () => {
        expect(showcaseFormSpacingOf('unknown')).toEqual(DEFAULT_SHOWCASE_FORM_SPACING)
    })
})
