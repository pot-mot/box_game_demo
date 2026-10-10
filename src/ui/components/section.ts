import {localizeText, type LocalKeyParam} from '../../i18n/dom.ts'

export const createSection = (title: LocalKeyParam): HTMLDivElement => {
    const div = document.createElement('div')
    div.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    localizeText(div, title)
    return div
}
