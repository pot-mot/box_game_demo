import {localizeText, type LocalKeyParam} from '../../i18n/dom.ts'

export const createSection = (title: LocalKeyParam): HTMLDivElement => {
    const div = document.createElement('div')
    div.className = 'dc-section'
    localizeText(div, title)
    return div
}
