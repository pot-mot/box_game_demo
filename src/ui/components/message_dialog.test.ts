import {describe, it, expect, beforeEach} from 'vitest'
import {showMessageDialog, showSkippedEntitiesNotice} from './message_dialog.ts'
import {setLocale} from '../../i18n/index.ts'

describe('message_dialog', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        setLocale('zh-cn')
    })

    it('showSkippedEntitiesNotice：无跳过项时不弹窗', async () => {
        await showSkippedEntitiesNotice([])
        expect(document.querySelector('#message-dialog')).toBeNull()
    })

    it('showSkippedEntitiesNotice：列出全部被跳过元素的 index 与 type', async () => {
        const promise = showSkippedEntitiesNotice([
            {index: 0, type: 'box/legacy', reason: 'x'},
            {index: 2, type: undefined, reason: 'y'},
        ])
        const overlay = document.querySelector('#message-dialog')
        expect(overlay).not.toBeNull()
        const rows = Array.from(overlay?.querySelectorAll('.dc-hint') ?? [])
        expect(rows).toHaveLength(2)
        expect(rows[0]?.textContent ?? '').toContain('#0')
        expect(rows[0]?.textContent ?? '').toContain('box/legacy')
        expect(rows[1]?.textContent ?? '').toContain('#2')
        expect(rows[1]?.textContent ?? '').toContain('（未知类型）')

        const ok = overlay?.querySelector('.dc-btn--primary')
        if (ok instanceof HTMLButtonElement) ok.click()
        await promise
        expect(document.querySelector('#message-dialog')).toBeNull()
    })

    it('showMessageDialog：正文与标题渲染，点击遮罩关闭', async () => {
        const promise = showMessageDialog({titleKey: 'save.skipped_title', message: 'hello'})
        const overlay = document.querySelector('#message-dialog')
        expect(overlay?.textContent ?? '').toContain('hello')
        expect(overlay?.textContent ?? '').toContain('存档加载提示')
        if (overlay instanceof HTMLElement) overlay.click()
        await promise
        expect(document.querySelector('#message-dialog')).toBeNull()
    })
})
