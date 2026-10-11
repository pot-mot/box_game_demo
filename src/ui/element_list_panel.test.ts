import {describe, it, expect, beforeEach} from 'vitest'
import {setupElementListPanel} from './element_list_panel.ts'
import {createInputRegistry} from '../input/registry.ts'
import {createEmitter, type SourceEmitter} from '../entity/box/base/types/event_emitter.ts'
import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {EntityType} from '../entity/constants.ts'

interface FakeSource {
    readonly source: EntityInfoSource
    readonly removed: number[]
}

/** 构造最小可用的实体来源（仅覆盖删除流程涉及的方法） */
const createFakeSource = (type: EntityType, selectedId?: number): FakeSource => {
    const events: SourceEmitter = createEmitter()
    let selected = selectedId
    const removed: number[] = []
    const source: EntityInfoSource = {
        type,
        events,
        panel: {render: () => {}, destroy: () => {}},
        panelInfo: [],
        getSelectedId: () => selected,
        select: (id) => { selected = id },
        remove: (id) => {
            removed.push(id)
            events.emit('delete', id, id === selected)
            if (id === selected) selected = undefined
        },
        getMeshes: () => [],
        getEntityList: () => [],
        spawnAt: () => {},
        syncPositions: () => {},
        setTransform: () => {},
    }
    return {source, removed}
}

const pressDelete = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Delete'}))
    window.dispatchEvent(new KeyboardEvent('keyup', {code: 'Delete'}))
}

describe('元素列表面板：Delete 删除', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        localStorage.clear()
        createInputRegistry()
    })

    it('删除当前选中的元素', () => {
        const {source, removed} = createFakeSource('box/common', 7)
        setupElementListPanel([source])
        pressDelete()
        expect(removed).toEqual([7])
    })

    it('跨多个来源删除唯一被选中的元素', () => {
        const box = createFakeSource('box/common')
        const terrain = createFakeSource('terrain', 3)
        setupElementListPanel([box.source, terrain.source])
        pressDelete()
        expect(box.removed).toEqual([])
        expect(terrain.removed).toEqual([3])
    })

    it('无选中且无悬停时不删除任何元素', () => {
        const {source, removed} = createFakeSource('box/common')
        setupElementListPanel([source])
        pressDelete()
        expect(removed).toEqual([])
    })
})
