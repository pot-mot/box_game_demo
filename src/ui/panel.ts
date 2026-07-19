import type {PanelContext} from '../entity/box/ui'

let container: HTMLElement | undefined
let currentPanel: PanelContext | undefined

const getContainer = (): HTMLElement => {
    if (!container) {
        container = document.createElement('div')
        container.id = 'entity-panel'
        document.body.appendChild(container)
    }
    return container
}

export const focusPanel = (panel: PanelContext | undefined): void => {
    if (currentPanel) {
        currentPanel.destroy()
    }
    currentPanel = panel
    const c = getContainer()
    c.innerHTML = ''
    if (panel) {
        c.style.removeProperty('display')
        panel.render(c)
    } else {
        c.style.display = 'none'
    }
}
