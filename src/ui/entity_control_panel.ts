import type {PanelContext} from '../entity/box/base/ui'
import {getInputRegistry} from '../input/registry.ts'

let container: HTMLElement | undefined
let currentPanel: PanelContext | undefined
let inputSetup = false

const ensureInputHook = (): void => {
    if (inputSetup) return
    inputSetup = true
    const input = getInputRegistry()
    input.onActionDown('close_panel', () => {
        if (currentPanel !== undefined) {
            focusPanel(undefined)
        }
    })
}

const getContainer = (): HTMLElement => {
    if (!container) {
        container = document.createElement('div')
        container.id = 'entity-control-panel'
        document.body.appendChild(container)
    }
    return container
}

export const focusPanel = (panel: PanelContext | undefined): void => {
    ensureInputHook()
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
