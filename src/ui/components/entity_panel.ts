/**
 * 实体属性面板通用容器
 * 统一各实体面板的主题外观（右下角浮动面板 + 金色标题 + 滚动 gutter），避免逐面板重复内联样式。
 * 面板初始 display:none，由各 PanelContext.render 追加到容器并置为 block。
 */

import {localizeText, type LocalKeyParam} from '../../i18n/dom.ts'

/** 创建实体属性面板根元素（已含标题，初始隐藏） */
export const createEntityPanel = (id: string, title: LocalKeyParam): HTMLDivElement => {
    const el = document.createElement('div')
    el.id = id
    el.className = 'dc-panel dc-scroll'
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:16px 20px;min-width:230px;max-height:70vh;user-select:none;display:none;'

    const header = document.createElement('div')
    header.className = 'dc-panel__title'
    localizeText(header, title)
    el.appendChild(header)
    return el
}

/** 追加一行「标签 + 输入框」的质量类字段（带上分隔） */
export const appendLabeledInputRow = (parent: HTMLElement, labelKey: LocalKeyParam, input: HTMLElement): void => {
    const section = document.createElement('div')
    section.className = 'dc-section'
    const label = document.createElement('label')
    label.className = 'dc-label'
    const text = document.createElement('span')
    localizeText(text, labelKey)
    label.appendChild(text)
    label.appendChild(document.createTextNode(' '))
    label.appendChild(input)
    section.appendChild(label)
    parent.appendChild(section)
}
