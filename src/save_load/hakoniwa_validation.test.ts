import {describe, it, expect} from 'vitest'
import {validateSaveData} from './validation.ts'

const base = (entities: unknown[]): unknown => ({version: 8, entities})

describe('箱庭存档校验', () => {
    it('交互物合法条目保留配置与运行态', () => {
        const data = validateSaveData(base([{
            type: 'interactable',
            config: {kind: 'switch', material: 'wood', size: [0.5, 0.8, 0.4], channel: 'ch', mode: 'toggle'},
            position: [1, 2, 3],
            yawQuarter: 1,
            progress: 0.5,
            target: 1,
            on: true,
            health: 1,
        }]))
        const e = data.entities[0]
        expect(e.type).toBe('interactable')
        if (e.type !== 'interactable') throw new Error('type')
        expect(e.config.kind).toBe('switch')
        expect(e.on).toBe(true)
        expect(e.yawQuarter).toBe(1)
    })

    it('未知交互物 kind 整体回退为可破坏道具默认配置，不抛错', () => {
        const data = validateSaveData(base([{
            type: 'interactable',
            config: {kind: 'unknown_kind'},
            position: [0, 0, 0],
        }]))
        const e = data.entities[0]
        if (e.type !== 'interactable') throw new Error('type')
        expect(e.config.kind).toBe('breakable')
    })

    it('箱子容器合法条目保留，缺失 container 安全回退', () => {
        const withContainer = validateSaveData(base([{
            type: 'interactable',
            config: {kind: 'chest', material: 'wood', size: [1, 0.8, 0.7], channel: '', capacity: 12},
            position: [0, 0, 0],
            container: {
                width: 6,
                height: 4,
                items: [{instanceId: 'a', defId: 'material_stone', count: 3, grid: {x: 0, y: 0, rot: 0}}],
                equipment: {},
            },
        }]))
        const e = withContainer.entities[0]
        if (e.type !== 'interactable') throw new Error('type')
        expect(e.container?.items.length).toBe(1)
        expect(e.container?.width).toBe(6)

        const withoutContainer = validateSaveData(base([{
            type: 'interactable',
            config: {kind: 'chest', material: 'wood', size: [1, 0.8, 0.7], channel: '', capacity: 12},
            position: [0, 0, 0],
        }]))
        const e2 = withoutContainer.entities[0]
        if (e2.type !== 'interactable') throw new Error('type')
        expect(e2.container).toBeUndefined()
    })

    it('掉落物未知 defId 保留结构、数量非法回退 1', () => {
        const data = validateSaveData(base([{
            type: 'item',
            config: {defId: 'whatever', count: -5},
            position: [0, 0, 0],
        }]))
        const e = data.entities[0]
        if (e.type !== 'item') throw new Error('type')
        expect(e.config.count).toBe(1)
    })

    it('modeInfo.play 背包与传送点字段保留；旧档缺失安全回退 undefined', () => {
        const data = validateSaveData({
            version: 8,
            entities: [],
            modeInfo: {
                play: {
                    inventory: {width: 8, height: 6, items: [{instanceId: 'a', defId: 'material_stone', count: 2, grid: {x: 0, y: 0, rot: 0}}], equipment: {}},
                    teleports: ['teleport:篝火'],
                },
            },
        })
        expect(data.modeInfo?.play?.inventory?.items.length).toBe(1)
        expect(data.modeInfo?.play?.teleports).toEqual(['teleport:篝火'])

        const legacy = validateSaveData({version: 7, entities: [], modeInfo: {play: {cameraInfo: {position: [0, 0, 0], rotate: [0, 0, 0]}}}})
        expect(legacy.modeInfo?.play?.inventory).toBeUndefined()
        expect(legacy.modeInfo?.play?.teleports).toBeUndefined()
    })
})
