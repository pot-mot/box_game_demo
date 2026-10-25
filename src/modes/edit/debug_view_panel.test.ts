import {beforeEach, describe, expect, it, vi} from 'vitest'
import {setupEditDebugPanel} from './debug_view_panel.ts'
import {CHARACTER_DEBUG_VIEWS, type CharacterDebugView} from '../../character/debug_views.ts'

describe('编辑模式显示控制面板', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('五类调试可视化默认全部关闭，且每个开关独立回调', () => {
        const calls: Array<[CharacterDebugView, boolean]> = []
        setupEditDebugPanel({setDebugVisible: (view, visible) => calls.push([view, visible])})

        /* 创建时把全部开关置为关闭（角色系统默认值也应为关闭） */
        expect(calls).toEqual(CHARACTER_DEBUG_VIEWS.map(view => [view, false]))
        for (const view of CHARACTER_DEBUG_VIEWS) {
            const input = document.querySelector<HTMLInputElement>(`#edit-debug-${view}`)
            expect(input).not.toBeNull()
            expect(input!.checked).toBe(false)
        }

        calls.length = 0
        const hurt = document.querySelector<HTMLInputElement>('#edit-debug-hurt')!
        hurt.checked = true
        hurt.dispatchEvent(new Event('change'))
        expect(calls).toEqual([['hurt', true]])
    })

    it('面板位于实体列表上方', () => {
        setupEditDebugPanel({setDebugVisible: vi.fn()})
        const panel = document.querySelector<HTMLElement>('#edit-debug-panel')!
        expect(panel.style.position).toBe('fixed')
        expect(panel.style.top).toBe('120px')
    })
})
