import {describe, it, expect, beforeEach} from 'vitest'
import {setupElementListPanel} from './element_list_panel.ts'
import {createInputRegistry} from '../input/registry.ts'
import {createEmitter, type SourceEmitter} from '../entity/box/base/types/event_emitter.ts'
import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {EntityType} from '../entity/constants.ts'
import {createOwnershipStore} from '../types/ownership_store.ts'

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

const setPanelInfo = (source: EntityInfoSource, id: number, type: EntityType): void => {
    source.panelInfo.push({
        id,
        type,
        badgeLabel: type === 'diorama' ? 'D' : 'B',
        badgeColor: '#888888',
        rowText: `${type} ${id}`,
    })
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
        const {source, removed} = createFakeSource('box', 7)
        setupElementListPanel([source])
        pressDelete()
        expect(removed).toEqual([7])
    })

    it('跨多个来源删除唯一被选中的元素', () => {
        const box = createFakeSource('box')
        const terrain = createFakeSource('terrain', 3)
        setupElementListPanel([box.source, terrain.source])
        pressDelete()
        expect(box.removed).toEqual([])
        expect(terrain.removed).toEqual([3])
    })

    it('每帧刷新徽章与行文本（阵营 / 倾向等变化即时同步）', () => {
        const {source} = createFakeSource('character')
        const update = setupElementListPanel([source])
        source.panelInfo.push({id: 1, type: 'character', badgeLabel: 'F0', badgeColor: '#111111', rowText: 'old'})
        update()
        const row = document.querySelector<HTMLElement>('[data-id="1"]')!
        expect(row.children[0].textContent).toBe('F0')
        expect((row.children[0] as HTMLElement).style.background).not.toBe('')
        expect(row.children[1].textContent).toBe('old')

        const entry = source.panelInfo[0]!
        entry.badgeLabel = 'F2'
        entry.badgeColor = '#ff0000'
        entry.rowTextOf = () => 'new'
        update()
        expect(row.children[0].textContent).toBe('F2')
        expect(row.children[1].textContent).toBe('new')
    })

    it('无选中且无悬停时不删除任何元素', () => {
        const {source, removed} = createFakeSource('box')
        setupElementListPanel([source])
        pressDelete()
        expect(removed).toEqual([])
    })
})


describe('元素列表面板：箱庭子实体嵌套', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        localStorage.clear()
        createInputRegistry()
    })

    it('归属实体列在箱庭行下方并带缩进容器', () => {
        const diorama = createFakeSource('diorama')
        const box = createFakeSource('box')
        setPanelInfo(diorama.source, 1, 'diorama')
        setPanelInfo(box.source, 10, 'box')
        const ownership = createOwnershipStore()
        ownership.set({type: 'box', runtimeId: 10}, {dioramaId: 'd1', nodeId: 'house'})

        const update = setupElementListPanel([diorama.source, box.source], {
            ownership,
            dioramaIdToEntityId: id => id === 'd1' ? 1 : undefined,
        })
        update()

        const dioramaRow = document.querySelector<HTMLElement>('[data-id="1"][data-type="diorama"]')
        const boxRow = document.querySelector<HTMLElement>('[data-id="10"][data-type="box"]')
        expect(dioramaRow).not.toBeNull()
        expect(boxRow).not.toBeNull()
        const children = boxRow!.parentElement!
        expect(children.classList.contains('dc-list-children')).toBe(true)
        expect(children.previousElementSibling).toBe(dioramaRow)
    })

    it('归属失效后子实体回到类型分组', () => {
        const diorama = createFakeSource('diorama')
        const box = createFakeSource('box')
        setPanelInfo(diorama.source, 1, 'diorama')
        setPanelInfo(box.source, 10, 'box')
        const ownership = createOwnershipStore()
        ownership.set({type: 'box', runtimeId: 10}, {dioramaId: 'd1', nodeId: 'house'})

        const update = setupElementListPanel([diorama.source, box.source], {
            ownership,
            dioramaIdToEntityId: id => id === 'd1' ? 1 : undefined,
        })
        update()
        ownership.remove({type: 'box', runtimeId: 10})
        update()

        const boxRow = document.querySelector<HTMLElement>('[data-id="10"][data-type="box"]')
        expect(boxRow).not.toBeNull()
        expect(boxRow!.parentElement!.classList.contains('dc-list-children')).toBe(false)
    })
})
