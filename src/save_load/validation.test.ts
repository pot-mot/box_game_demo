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
                attack: {weaponId: 'long_sword', damage: 3, cooldown: 0.5},
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
                    attack: {weaponId: 'long_sword', damage: 3, cooldown: 0.5},
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
            expect(result.entities[0].config.speed).toBe(3)
            expect(result.entities[0].config.scale).toBe(1)
            expect(result.entities[0].config.faction).toBe(0)
            expect(result.entities[0].config.maxHealth).toBe(100)
            expect(result.entities[0].config.isPlayer).toBe(false)
            expect(result.entities[0].config.navEnabled).toBe(true)
            expect(result.entities[0].config.tendency.tendencyId).toBe('hostileExceptSelf')
            expect(result.entities[0].config.attack.weaponId).toBe('long_sword')
            expect(result.entities[0].health).toBe(15)
            expect(result.entities[0].position).toEqual([0, 0, 0])
            expect(result.entities[0].quaternion).toEqual([0, 0, 0, 1])
        }
    })

    it('character 基础防御 / 护甲 — 可选字段：合法值保留，非法结构安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    attack: {weaponId: 'long_sword', damage: 3},
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({
            defense: {physical: 2, magic: 1},
            armor: {head: 'iron_helmet', chest: 'iron_plate', arms: 'iron_bracers', legs: 'iron_greaves'},
        }))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.defense).toEqual({physical: 2, magic: 1})
            expect(e0.config.armor).toEqual({head: 'iron_helmet', chest: 'iron_plate', arms: 'iron_bracers', legs: 'iron_greaves'})
        }

        /* 未知护甲 id 属于运行时容错范畴：校验层保留字符串，加载时由 resolveArmorLoadout 回退空槽 */
        const unknownId = validateSaveData(characterConfig({armor: {chest: 'no_such_armor'}}))
        const e1 = unknownId.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.armor?.chest).toBe('no_such_armor')
        }

        /* 负防御 / 非对象结构：整体回退 undefined，不抛错 */
        expect(() => validateSaveData(characterConfig({defense: {physical: -1, magic: 0}}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({defense: 5}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({armor: {head: 42}}))).not.toThrow()
        const invalid = validateSaveData(characterConfig({defense: 5, armor: {head: 42}}))
        const e2 = invalid.entities[0]
        if (e2.type === 'character') {
            expect(e2.config.defense).toBeUndefined()
            expect(e2.config.armor).toBeUndefined()
        }
    })

    it('character 锁定点 — 可选字段：合法值保留，非法结构安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    attack: {weaponId: 'long_sword', damage: 3},
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({
            lockPoints: [
                {jointId: 'headNeck', offset: [0, 0.2, 0]},
                {jointId: 'rightHandPivot', offset: [0.1, 0, -0.05]},
            ],
        }))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.lockPoints).toEqual([
                {jointId: 'headNeck', offset: [0, 0.2, 0]},
                {jointId: 'rightHandPivot', offset: [0.1, 0, -0.05]},
            ])
        }

        /* 非法结构（偏移长度错误 / 非数字 / 空关节 id / 非数组）：整体回退 undefined，不抛错 */
        expect(() => validateSaveData(characterConfig({lockPoints: [{jointId: 'spine', offset: [0, 1]}]}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({lockPoints: [{jointId: 'spine', offset: ['a', 0, 0]}]}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({lockPoints: [{jointId: '', offset: [0, 0, 0]}]}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({lockPoints: 5}))).not.toThrow()
        const invalid = validateSaveData(characterConfig({lockPoints: [{jointId: 'spine', offset: [0, 1]}]}))
        const e1 = invalid.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.lockPoints).toBeUndefined()
        }
    })

    it('character 持握模式 / 副手武器 — 可选字段：合法值保留，非法结构安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    attack: {weaponId: 'long_sword', damage: 3},
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({
            holdMode: 'dual_wield',
            offhand: {weaponId: 'short_sword', damage: 2},
        }))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.holdMode).toBe('dual_wield')
            expect(e0.config.offhand).toEqual({weaponId: 'short_sword', damage: 2})
        }

        /* 未知武器 id 属于运行时容错范畴：校验层保留字符串，world.add 加载时安全丢弃 */
        const unknownId = validateSaveData(characterConfig({offhand: {weaponId: 'no_such_weapon'}}))
        const e1 = unknownId.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.offhand?.weaponId).toBe('no_such_weapon')
        }

        /* 非法持握模式 / 非法副手结构：回退 undefined，不抛错 */
        expect(() => validateSaveData(characterConfig({holdMode: 'nope'}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({offhand: 5}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({offhand: {weaponId: 42}}))).not.toThrow()
        const invalid = validateSaveData(characterConfig({holdMode: 'nope', offhand: {weaponId: 42}}))
        const e2 = invalid.entities[0]
        if (e2.type === 'character') {
            expect(e2.config.holdMode).toBeUndefined()
            expect(e2.config.offhand).toBeUndefined()
        }
    })

    it('character 旧存档缺 defense / armor / lockPoints / holdMode / offhand 字段：缺省为 undefined', () => {
        const result = validateSaveData({entities: [{type: 'character'}]})
        const entity = result.entities[0]
        if (entity.type === 'character') {
            expect(entity.config.defense).toBeUndefined()
            expect(entity.config.armor).toBeUndefined()
            expect(entity.config.lockPoints).toBeUndefined()
            expect(entity.config.holdMode).toBeUndefined()
            expect(entity.config.offhand).toBeUndefined()
        }
    })

    it('character facing 朝向角 — 可选字段，旧存档缺省时为 undefined，越界拒绝', () => {
        const withFacing = validateSaveData({entities: [{type: 'character', facing: 270}]})
        const e0 = withFacing.entities[0]
        if (e0.type === 'character') {
            expect(e0.facing).toBe(270)
        }
        const withoutFacing = validateSaveData({entities: [{type: 'character'}]})
        const e1 = withoutFacing.entities[0]
        if (e1.type === 'character') {
            expect(e1.facing).toBeUndefined()
        }
        expect(() => validateSaveData({entities: [{type: 'character', facing: 400}]})).toThrow()
        expect(() => validateSaveData({entities: [{type: 'character', facing: -1}]})).toThrow()
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

    it('旧存档废弃字段（radius / attackSlot）通过校验：未知键静默丢弃并按默认攻击配置回退', () => {
        const data = {
            entities: [{
                type: 'character',
                config: {
                    speed: 6,
                    jumpHeight: 2,
                    radius: 0.125,
                    height: 1,
                    /* 旧版存档的 attackSlot 结构已废弃（现为 attack），zod 默认剥离未知键 */
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
            /* attack 缺失 → 默认武器配置（不会因旧字段崩溃） */
            expect(result.entities[0].config.attack.weaponId).toBe('long_sword')
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
