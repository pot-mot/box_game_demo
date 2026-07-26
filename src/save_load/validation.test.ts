import {describe, it, expect} from 'vitest'
import {validateSaveData} from './validation.ts'

const makeValidSave = () => ({
    entities: [
        {
            type: 'box/common' as const,
            config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3},
            position: [0, 0.5, 0] as [number, number, number],
            quaternion: [0, 0, 0, 1] as [number, number, number, number],
        },
    ],
})

describe('validateSaveData', () => {
    it('校验通过有效存档数据', () => {
        const data = makeValidSave()
        const result = validateSaveData(data)
        expect(result.entities).toHaveLength(1)
        expect(result.entities[0].type).toBe('box/common')
    })

    it('校验通过空实体列表', () => {
        const result = validateSaveData({entities: []})
        expect(result.entities).toHaveLength(0)
    })

    it('校验通过不含 modeInfo 的存档', () => {
        const data = {entities: []}
        const result = validateSaveData(data)
        expect(result.modeInfo).toBeUndefined()
    })

    it('拒绝错误的实体 type 字面量', () => {
        const data = {
            entities: [{...makeValidSave().entities[0], type: 'invalid'}],
        }
        expect(() => validateSaveData(data)).toThrow()
    })

    it('拒绝非法的配置参数', () => {
        const data = {
            entities: [{
                ...makeValidSave().entities[0],
                config: {width: -1, height: 1, depth: 1, mass: 1, friction: 0.3},
            }],
        }
        expect(() => validateSaveData(data)).toThrow()
    })

    it('校验通过所有实体类型', () => {
        const types = [
            {type: 'box/common', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3}},
            {type: 'box/destruction', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, maxHealth: 100}, health: 100},
            {type: 'box/burning', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, maxHealth: 100}, health: 100, burnProgress: 0.5},
            {type: 'box/magnet', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, attractionRadius: 5, attractionStrength: 10}},
            {type: 'box/elasticity', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, stiffness: 100, dampingRatio: 0.5, maxDeformFraction: 0.3}, def: [0, 0, 0], vel: [0, 0, 0]},
            {type: 'area/water', config: {width: 2, height: 2, depth: 2, density: 2}},
            {type: 'terrain', config: {gridSize: 10, cellSize: 1, minHeight: 0, maxHeight: 5, friction: 0.3, generatorId: 'fbm'}, heights: [[0]]},
            {type: 'fragment/common', config: {mass: 0.1, lifetime: 5}, data: {renderVertices: [0, 0, 0, 1, 1, 1, 1, 0, 0], renderIndices: [0, 1, 2], hullVertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], hullFaces: [[0, 1, 2]], centroid: [0, 0, 0], massRatio: 1, boxSize: [1, 1, 1]}},
        ]
        for (const entity of types) {
            const data = {
                entities: [{...entity, position: [0, 0.5, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number]}],
            }
            expect(() => validateSaveData(data)).not.toThrow(entity.type)
        }
    })

    it('拒绝非对象类型', () => {
        expect(() => validateSaveData(null)).toThrow()
        expect(() => validateSaveData('string')).toThrow()
        expect(() => validateSaveData(42)).toThrow()
    })

    it('拒绝 entities 非数组', () => {
        expect(() => validateSaveData({entities: 'not-array'})).toThrow()
    })

    it('拒绝缺少必填字段的实体', () => {
        const data = {
            entities: [{type: 'box/common', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3}, quaternion: [0, 0, 0, 1]}],
        }
        expect(() => validateSaveData(data)).toThrow()
    })

    it('通过 edit modeInfo', () => {
        const data = {
            entities: [],
            modeInfo: {
                edit: {
                    cameraInfo: {
                        position: [1, 2, 3] as [number, number, number],
                        rotate: [0, 1, 0] as [number, number, number],
                    },
                },
            },
        }
        expect(() => validateSaveData(data)).not.toThrow()
    })

    it('通过 play modeInfo 含 playerInfo', () => {
        const data = {
            entities: [],
            modeInfo: {
                play: {
                    cameraInfo: {
                        position: [1, 2, 3] as [number, number, number],
                        rotate: [0, 1, 0] as [number, number, number],
                    },
                    playerInfo: {
                        position: [5, 0, 5] as [number, number, number],
                    },
                },
            },
        }
        expect(() => validateSaveData(data)).not.toThrow()
    })
})
