import {describe, expect, it} from 'vitest'
import {createTimelineControls, normalizeTimelineZoom} from './timeline_controls.ts'
import {TIMELINE_MAX_PX_PER_SEC, TIMELINE_MIN_PX_PER_SEC} from './constants.ts'

describe('时间轴缩放输入', () => {
    it('有效数字夹取到允许范围，非法值返回 undefined', () => {
        expect(normalizeTimelineZoom('120')).toBe(120)
        expect(normalizeTimelineZoom(String(TIMELINE_MIN_PX_PER_SEC - 1))).toBe(TIMELINE_MIN_PX_PER_SEC)
        expect(normalizeTimelineZoom(String(TIMELINE_MAX_PX_PER_SEC + 1))).toBe(TIMELINE_MAX_PX_PER_SEC)
        expect(normalizeTimelineZoom('0')).toBeUndefined()
        expect(normalizeTimelineZoom('-10')).toBeUndefined()
        expect(normalizeTimelineZoom('abc')).toBeUndefined()
    })

    it('控制条提供缩放输入框', () => {
        const container = document.createElement('div')
        const controls = createTimelineControls(container, 240, () => {})
        const input = container.querySelector('input[type="number"][step="10"]')
        expect(input).toBe(controls.zoomInput)
        expect(input).toBeInstanceOf(HTMLInputElement)
        expect((input as HTMLInputElement).type).toBe('number')
    })

    it('不提供删除动画入口', () => {
        const container = document.createElement('div')
        createTimelineControls(container, 240, () => {})
        expect([...container.querySelectorAll('button')].some(button => button.textContent?.includes('动画') && button.textContent?.includes('−'))).toBe(false)
    })
})
