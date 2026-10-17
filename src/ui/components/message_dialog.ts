import type {LocalKeyParam} from '../../i18n/index.ts'
import {translate} from '../../i18n/index.ts'
import {localizeText} from '../../i18n/dom.ts'
import {createIcon} from '../icons/icon.ts'
import type {SkippedEntity} from '../../save_load/validation.ts'

export interface MessageDialogOptions {
    /** 标题文案键 */
    readonly titleKey: LocalKeyParam
    /** 正文（已本地化的纯文本，可为空串省略） */
    readonly message?: string
    /** 明细行（已本地化的纯文本，逐行展示于可滚动列表） */
    readonly details?: readonly string[]
    /** 关闭按钮文案键，默认 `common.close` */
    readonly closeKey?: LocalKeyParam
}

/**
 * 弹出阻塞式提示对话框（遮罩 + 面板 + 关闭按钮）。
 * 关闭（按钮 / 右上角图标 / 点击遮罩）后 resolve，便于按顺序串接多个提示。
 */
export const showMessageDialog = (options: MessageDialogOptions): Promise<void> => {
    const closeKey: LocalKeyParam = options.closeKey ?? 'common.close'

    const overlay = document.createElement('div')
    overlay.id = 'message-dialog'
    overlay.className = 'dc-overlay'
    overlay.style.zIndex = '2000'

    const panel = document.createElement('div')
    panel.className = 'dc-panel'
    panel.style.cssText = 'display:flex;flex-direction:column;gap:var(--dc-space-2);min-width:320px;max-width:520px;max-height:80vh;padding:var(--dc-space-3) var(--dc-space-4)'
    overlay.appendChild(panel)

    const header = document.createElement('div')
    header.className = 'dc-row'
    header.style.cssText = 'justify-content:space-between'
    panel.appendChild(header)

    const title = document.createElement('div')
    title.className = 'dc-panel__title'
    title.style.cssText = 'flex:1;margin-bottom:0;padding-bottom:0;border-bottom:none'
    localizeText(title, options.titleKey)
    header.appendChild(title)

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'dc-btn dc-btn--ghost'
    closeBtn.appendChild(createIcon('close'))
    header.appendChild(closeBtn)

    if (options.message !== undefined && options.message.length > 0) {
        const message = document.createElement('div')
        message.className = 'dc-label'
        message.textContent = options.message
        panel.appendChild(message)
    }

    if (options.details !== undefined && options.details.length > 0) {
        const list = document.createElement('div')
        list.className = 'dc-list dc-scroll'
        list.style.cssText = 'max-height:50vh;padding-right:var(--dc-space-1)'
        for (const line of options.details) {
            const row = document.createElement('div')
            row.className = 'dc-hint dc-mono'
            row.textContent = line
            list.appendChild(row)
        }
        panel.appendChild(list)
    }

    const footer = document.createElement('div')
    footer.className = 'dc-row'
    footer.style.cssText = 'justify-content:flex-end'
    panel.appendChild(footer)

    const okBtn = document.createElement('button')
    okBtn.type = 'button'
    okBtn.className = 'dc-btn dc-btn--primary'
    localizeText(okBtn, closeKey)
    footer.appendChild(okBtn)

    document.body.appendChild(overlay)

    return new Promise<void>(resolve => {
        const done = (): void => {
            overlay.remove()
            resolve()
        }
        okBtn.addEventListener('click', done)
        closeBtn.addEventListener('click', done)
        overlay.addEventListener('click', e => {
            if (e.target === overlay) done()
        })
    })
}

/**
 * 就「被跳过的存档元素」弹出提示：仅当存在跳过项时显示，列出全部 `index + type`。
 * @param skipped 校验层收集的跳过明细（为空则不弹窗，直接 resolve）
 */
export const showSkippedEntitiesNotice = (skipped: readonly SkippedEntity[]): Promise<void> => {
    if (skipped.length === 0) return Promise.resolve()
    const unknownType = translate('save.skipped_unknown_type')
    const details = skipped.map(entry =>
        translate({key: 'save.skipped_entry', args: [entry.index, entry.type ?? unknownType]}),
    )
    return showMessageDialog({
        titleKey: 'save.skipped_title',
        message: translate({key: 'save.skipped_message', args: [skipped.length]}),
        details,
    })
}
