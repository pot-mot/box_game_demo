import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {Mock} from 'vitest'
import {createEmitter, type SourceEventMap} from '../../../box/base/types/event_emitter.ts'
import {setupTerrainSculptPanel, type TerrainSculptPanelSource} from './sculpt_panel.ts'
import type {TerrainSculpt} from '../edit/sculpt.ts'

interface MockSculpt extends TerrainSculpt {
    readonly setEnabledMock: Mock<(v: boolean) => void>
}

const makeSculpt = (): MockSculpt => {
    let enabled = false
    const setEnabledMock = vi.fn((v: boolean) => { enabled = v })
    return {
        setEnabled: setEnabledMock,
        isEnabled: () => enabled,
        dispose: vi.fn(),
        setEnabledMock,
    }
}

describe('地形雕刻面板：显隐与启用', () => {
    let emitter: ReturnType<typeof createEmitter<SourceEventMap>>
    let selectedId: number | undefined
    let onToggle: Mock<(enabled: boolean) => void>
    let sculpt: MockSculpt
    let dispose: () => void

    const mount = (): void => {
        const source: TerrainSculptPanelSource = {getSelectedId: () => selectedId, events: emitter}
        dispose = setupTerrainSculptPanel(sculpt, [source], onToggle)
    }

    const panel = (): HTMLElement => document.getElementById('terrain-sculpt-panel') as HTMLElement
    const checkbox = (): HTMLInputElement => document.getElementById('terrain-sculpt-enable') as HTMLInputElement

    beforeEach(() => {
        document.body.innerHTML = ''
        emitter = createEmitter<SourceEventMap>()
        selectedId = undefined
        onToggle = vi.fn<(enabled: boolean) => void>()
        sculpt = makeSculpt()
    })

    afterEach(() => {
        dispose()
    })

    it('未选中地形时隐藏；选中后显示', () => {
        mount()
        expect(panel().style.display).toBe('none')

        selectedId = 3
        emitter.emit('select', 3)
        expect(panel().style.display).toBe('')
    })

    it('勾选复选框启用雕刻并通知 onToggle', () => {
        selectedId = 3
        mount()
        checkbox().checked = true
        checkbox().dispatchEvent(new Event('change'))

        expect(sculpt.setEnabledMock).toHaveBeenLastCalledWith(true)
        expect(onToggle).toHaveBeenLastCalledWith(true)
    })

    it('取消选中时隐藏并强制关闭雕刻', () => {
        selectedId = 3
        mount()
        checkbox().checked = true
        checkbox().dispatchEvent(new Event('change'))

        selectedId = undefined
        emitter.emit('select', undefined)

        expect(panel().style.display).toBe('none')
        expect(sculpt.isEnabled()).toBe(false)
        expect(onToggle).toHaveBeenLastCalledWith(false)
    })
})
