import {localizeText} from '../../i18n/dom.ts'

export const createButtonRow = (): { container: HTMLDivElement; applyBtn: HTMLButtonElement; deleteBtn: HTMLButtonElement } => {
    const container = document.createElement('div')
    container.style.cssText = 'display:flex;gap:8px;margin-top:8px'
    const applyBtn = document.createElement('button')
    applyBtn.style.flex = '1'
    localizeText(applyBtn, 'common.apply')
    const deleteBtn = document.createElement('button')
    deleteBtn.style.flex = '1'
    localizeText(deleteBtn, 'common.delete')
    container.appendChild(applyBtn)
    container.appendChild(deleteBtn)
    return {container, applyBtn, deleteBtn}
}
