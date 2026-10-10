import {describe, it, expect, vi} from 'vitest'
import {setupBuildingBrushPanel} from './brush_panel.ts'
import {createEmitter, type SourceEventMap} from '../../box/base/types/event_emitter.ts'
import type {BuildingBrush, BuildingBrushTool} from '../edit/brush.ts'
import type {BuildingPropKind} from '../props/kinds.ts'
import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import {DEFAULT_BUILDING_CONFIG} from '../validation.ts'

const createFakeBrush = (): BuildingBrush => {
    let enabled = false
    let material: SurfaceMaterialId = 'brick'
    let tool: BuildingBrushTool = 'place'
    let propKind: BuildingPropKind = 'door'
    let stampConfig = {...DEFAULT_BUILDING_CONFIG}
    return {
        setEnabled: v => { enabled = v },
        isEnabled: () => enabled,
        setMaterial: m => { material = m },
        getMaterial: () => material,
        setTool: t => { tool = t },
        getTool: () => tool,
        setPropKind: k => { propKind = k },
        getPropKind: () => propKind,
        setStampConfig: c => { stampConfig = {...c} },
        getStampConfig: () => ({...stampConfig}),
        dispose: () => undefined,
    }
}

const setup = (initialSelected: number | undefined = undefined) => {
    const brush = createFakeBrush()
    const events = createEmitter<SourceEventMap>()
    let selectedId = initialSelected
    const onToggle = vi.fn()
    const cleanup = setupBuildingBrushPanel(
        brush,
        {events, getSelectedId: () => selectedId},
        onToggle,
    )
    const panel = document.getElementById('building-brush-panel')
    const checkbox = document.getElementById('brush-enable')
    if (!(panel instanceof HTMLElement) || !(checkbox instanceof HTMLInputElement)) {
        throw new Error('笔刷面板未正确创建')
    }
    const select = (id: number | undefined): void => {
        selectedId = id
        events.emit('select', id)
    }
    return {brush, onToggle, panel, checkbox, select, cleanup}
}

describe('setupBuildingBrushPanel：仅选中建筑时显示', () => {
    it('未选中时隐藏，选中后显示，取消选中后再次隐藏', () => {
        const {panel, select, cleanup} = setup()
        expect(panel.style.display).toBe('none')

        select(1)
        expect(panel.style.display).toBe('')

        select(undefined)
        expect(panel.style.display).toBe('none')

        cleanup()
    })

    it('初始化时已选中建筑则直接显示', () => {
        const {panel, cleanup} = setup(7)
        expect(panel.style.display).toBe('')
        cleanup()
    })

    it('隐藏时强制关闭已启用的笔刷并复位开关、回调 onToggle(false)', () => {
        const {brush, onToggle, checkbox, select, cleanup} = setup()
        select(1)

        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))
        expect(brush.isEnabled()).toBe(true)
        expect(onToggle).toHaveBeenLastCalledWith(true)

        select(undefined)
        expect(brush.isEnabled()).toBe(false)
        expect(checkbox.checked).toBe(false)
        expect(onToggle).toHaveBeenLastCalledWith(false)

        cleanup()
    })

    it('清理时移除面板并退订选中事件', () => {
        const {panel, select, cleanup} = setup()
        cleanup()
        expect(document.getElementById('building-brush-panel')).toBeNull()

        select(1)
        expect(panel.style.display).toBe('none')
    })
})
