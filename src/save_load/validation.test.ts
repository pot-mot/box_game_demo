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
            {type: 'box/burning', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, maxHealth: 100}, health: 100},
            {type: 'box/magnet', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, attractionRadius: 5, attractionStrength: 10}},
            {type: 'box/elasticity', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, stiffness: 100, dampingRatio: 0.5, maxDeformFraction: 0.3}, def: [0, 0, 0], vel: [0, 0, 0]},
            {type: 'area/water', config: {width: 2, height: 2, depth: 2, density: 2}},
            {type: 'terrain', config: {gridSize: 10, cellSize: 1, minHeight: 0, maxHeight: 5, friction: 0.3, generatorId: 'fbm'}, heights: [[0]]},
            {type: 'fragment/common', config: {mass: 0.1, friction: 0.3, lifetime: 5, maxLifetime: 5}, data: {renderVertices: [0, 0, 0, 1, 1, 1, 1, 0, 0], renderIndices: [0, 1, 2], hullVertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], hullFaces: [[0, 1, 2]], centroid: [0, 0, 0], massRatio: 1, boxSize: [1, 1, 1]}},
            {type: 'character', config: {
                speed: 6, jumpHeight: 2, scale: 1,
                attackSlot: {type: 'melee', range: 1.5, damage: 3, cooldown: 0.5, duration: 0.3},
                tendency: {tendencyId: 'hostileExceptSelf'},
                faction: 0, maxHealth: 15, isPlayer: false,
            }, health: 15},
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

    it('拒绝缺少 entities 的存档', () => {
        expect(() => validateSaveData({})).toThrow()
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

    it('通过 play modeInfo', () => {
        const data = {
            entities: [],
            modeInfo: {
                play: {
                    cameraInfo: {
                        position: [1, 2, 3] as [number, number, number],
                        rotate: [0, 1, 0] as [number, number, number],
                    },
                },
            },
        }
        expect(() => validateSaveData(data)).not.toThrow()
    })

    it('character 缺少 isPlayer 时默认为 false', () => {
        const data = {
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    attackSlot: {type: 'melee', range: 1.5, damage: 3, cooldown: 0.5, duration: 0.3},
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15,
                },
                health: 15,
            }],
        }
        const result = validateSaveData(data)
        expect(result.entities[0].type).toBe('character')
        if (result.entities[0].type === 'character') {
            expect(result.entities[0].config.isPlayer).toBe(false)
        }
    })

    it('最小合法存档 — 仅 type 通过校验', () => {
        const types = [
            'box/common',
            'box/destruction',
            'box/burning',
            'box/magnet',
            'box/elasticity',
            'area/water',
            'terrain',
            'fragment/common',
            'character',
        ]
        for (const type of types) {
            const data = {entities: [{type}]}
            expect(() => validateSaveData(data)).not.toThrow(type)
        }
    })

    it('最小合法存档 — character 各字段取默认值', () => {
        const data = {entities: [{type: 'character'}]}
        const result = validateSaveData(data)
        expect(result.entities).toHaveLength(1)
        expect(result.entities[0].type).toBe('character')
        if (result.entities[0].type === 'character') {
            expect(result.entities[0].config.speed).toBe(6)
            expect(result.entities[0].config.scale).toBe(1)
            expect(result.entities[0].config.faction).toBe(0)
            expect(result.entities[0].config.maxHealth).toBe(100)
            expect(result.entities[0].config.isPlayer).toBe(false)
            expect(result.entities[0].config.tendency.tendencyId).toBe('hostileExceptSelf')
            expect(result.entities[0].config.attackSlot.type).toBe('melee')
            expect(result.entities[0].health).toBe(15)
            expect(result.entities[0].position).toEqual([0, 0, 0])
            expect(result.entities[0].quaternion).toEqual([0, 0, 0, 1])
        }
    })

    it('最小合法存档 — box/common 各字段取默认值', () => {
        const data = {entities: [{type: 'box/common'}]}
        const result = validateSaveData(data)
        expect(result.entities).toHaveLength(1)
        expect(result.entities[0].type).toBe('box/common')
        if (result.entities[0].type === 'box/common') {
            expect(result.entities[0].config.width).toBe(1)
            expect(result.entities[0].config.height).toBe(1)
            expect(result.entities[0].config.depth).toBe(1)
            expect(result.entities[0].config.mass).toBe(1)
            expect(result.entities[0].config.friction).toBe(0.3)
            expect(result.entities[0].position).toEqual([0, 0, 0])
            expect(result.entities[0].quaternion).toEqual([0, 0, 0, 1])
        }
    })

    it('旧存档含废弃字段 radius 通过校验（静默丢弃）', () => {
        const data = {
            entities: [{
                type: 'character',
                config: {
                    speed: 6,
                    jumpHeight: 2,
                    radius: 0.125,
                    height: 1,
                    attackSlot: {type: 'melee', range: 1.5, damage: 3, cooldown: 0.5, duration: 0.3},
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0,
                    maxHealth: 15,
                    isPlayer: false,
                },
            }],
        }
        expect(() => validateSaveData(data)).not.toThrow()
        const result = validateSaveData(data)
        if (result.entities[0].type === 'character') {
            expect(result.entities[0].config.scale).toBe(1)
        }
    })

    it('存档含未知多余字段通过校验（静默丢弃）', () => {
        const data = {
            entities: [{
                type: 'box/common',
                config: {width: 2, height: 2, depth: 2, mass: 1, friction: 0.3},
                position: [0, 0, 0],
                quaternion: [0, 0, 0, 1],
                extraField: 'should-be-ignored',
            }],
        }
        expect(() => validateSaveData(data)).not.toThrow()
    })
})
