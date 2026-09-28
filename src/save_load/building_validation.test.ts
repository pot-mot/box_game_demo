import {describe, expect, it} from 'vitest'
import {encodeRle} from '../entity/building_generator/grid/rle.ts'
import {validateSaveData} from './validation.ts'

const solidChunk = (): string => encodeRle(new Uint8Array(4096).fill(1))

describe('存档 v7 building_generator', () => {
    it('接受含建筑世界的存档', () => {
        const result = validateSaveData({
            version: 7,
            entities: [{
                type: 'building_generator',
                worlds: [{
                    origin: [1, 2, 3],
                    yawQuarter: 2,
                    palette: ['brick'],
                    chunks: [{key: [0, 0, 0], rle: solidChunk()}],
                }],
            }],
        })
        const entity = result.entities[0]
        expect(entity.type).toBe('building_generator')
        if (entity.type !== 'building_generator') return
        expect(entity.worlds.length).toBe(1)
        expect(entity.worlds[0].palette).toEqual(['brick'])
        expect(entity.worlds[0].yawQuarter).toBe(2)
    })

    it('缺少 worlds 字段时回退为空数组', () => {
        const result = validateSaveData({version: 7, entities: [{type: 'building_generator'}]})
        const entity = result.entities[0]
        if (entity.type !== 'building_generator') throw new Error('类型应为 building_generator')
        expect(entity.worlds).toEqual([])
    })

    it('worlds 结构非法时整体回退为空而不抛错', () => {
        const result = validateSaveData({version: 7, entities: [{type: 'building_generator', worlds: 'bad'}]})
        const entity = result.entities[0]
        if (entity.type !== 'building_generator') throw new Error('类型应为 building_generator')
        expect(entity.worlds).toEqual([])
    })

    it('解析自由道具并在非法种类时回退 door', () => {
        const result = validateSaveData({
            version: 7,
            entities: [{
                type: 'building_generator',
                worlds: [{
                    origin: [0, 0, 0],
                    props: [
                        {kind: 'window', material: 'wood', position: [1, 2, 3], yawQuarter: 1},
                        {kind: 'not_a_kind', material: 'not_a_material', position: [0, 0, 0]},
                    ],
                }],
            }],
        })
        const entity = result.entities[0]
        if (entity.type !== 'building_generator') throw new Error('类型应为 building_generator')
        expect(entity.worlds[0].props.length).toBe(2)
        expect(entity.worlds[0].props[0]).toEqual({kind: 'window', material: 'wood', position: [1, 2, 3], yawQuarter: 1})
        expect(entity.worlds[0].props[1].kind).toBe('door')
        expect(entity.worlds[0].props[1].material).toBe('rock')
    })

    it('道具结构非法时整体回退为空数组', () => {
        const result = validateSaveData({
            version: 7,
            entities: [{type: 'building_generator', worlds: [{origin: [0, 0, 0], props: 'bad'}]}],
        })
        const entity = result.entities[0]
        if (entity.type !== 'building_generator') throw new Error('类型应为 building_generator')
        expect(entity.worlds[0].props).toEqual([])
    })

    it('未知材质调色板条目安全回退为空调色板', () => {
        const result = validateSaveData({
            version: 7,
            entities: [{
                type: 'building_generator',
                worlds: [{origin: [0, 0, 0], palette: ['not_a_material'], chunks: []}],
            }],
        })
        const entity = result.entities[0]
        if (entity.type !== 'building_generator') throw new Error('类型应为 building_generator')
        expect(entity.worlds[0].palette).toEqual([])
    })
})
