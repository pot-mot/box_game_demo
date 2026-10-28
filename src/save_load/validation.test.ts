import {describe, it, expect} from 'vitest'
import {validateSaveData, parseSaveData} from './validation.ts'

const makeValidSave = () => ({
    entities: [
        {
            type: 'box' as const,
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
        expect(result.entities[0].type).toBe('box')
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

    it('未知实体 type：整档不失败，该元素被跳过并记录明细', () => {
        const data = {
            entities: [{...makeValidSave().entities[0], type: 'invalid'}],
        }
        const result = parseSaveData(data)
        expect(result.data.entities).toHaveLength(0)
        expect(result.skipped).toHaveLength(1)
        expect(result.skipped[0].index).toBe(0)
        expect(result.skipped[0].type).toBe('invalid')
    })

    it('旧 area/water 元素按未知类型跳过，不整档失败', () => {
        const data = {
            entities: [
                {type: 'area/water', config: {width: 2, height: 2, depth: 2, density: 2}, position: [0, 0, 0], quaternion: [0, 0, 0, 1]},
                makeValidSave().entities[0],
            ],
        }
        const result = parseSaveData(data)
        expect(result.data.entities).toHaveLength(1)
        expect(result.data.entities[0].type).toBe('box')
        expect(result.skipped).toHaveLength(1)
        expect(result.skipped[0].type).toBe('area/water')
    })

    it('非法配置参数：该元素被跳过，其余合法元素保留', () => {
        const data = {
            entities: [
                {
                    ...makeValidSave().entities[0],
                    config: {width: -1, height: 1, depth: 1, mass: 1, friction: 0.3},
                },
                makeValidSave().entities[0],
            ],
        }
        const result = parseSaveData(data)
        expect(result.data.entities).toHaveLength(1)
        expect(result.skipped).toHaveLength(1)
        expect(result.skipped[0].index).toBe(0)
    })

    it('校验通过所有实体类型', () => {
        const types = [
            {type: 'box', config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3}},
            {
                type: 'box',
                config: {
                    width: 1, height: 1, depth: 1, mass: 1, friction: 0.3,
                    destructible: {maxHealth: 100},
                    burning: {maxHealth: 100},
                    magnet: {attractionRadius: 5, attractionStrength: 3},
                    elastic: {stiffness: 30, dampingRatio: 0.5, maxDeformFraction: 0.3},
                },
                destructible: {health: 100},
                burning: {health: 100},
                elastic: {def: [0, 0, 0], vel: [0, 0, 0]},
            },
            {type: 'area', config: {shape: {kind: 'sphere', radius: 2}, material: 'air', fields: {wind: {speed: 8}}}},
            {type: 'terrain', config: {gridSize: 10, cellSize: 1, minHeight: 0, maxHeight: 5, friction: 0.3, generatorId: 'fbm'}, heights: [[0]]},
            {type: 'fragment/common', config: {mass: 0.1, friction: 0.3, lifetime: 5, maxLifetime: 5}, data: {renderVertices: [0, 0, 0, 1, 1, 1, 1, 0, 0], renderIndices: [0, 1, 2], hullVertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], hullFaces: [[0, 1, 2]], centroid: [0, 0, 0], massRatio: 1, boxSize: [1, 1, 1]}},
            {type: 'character', config: {
                speed: 6, jumpHeight: 2, scale: 1,
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
            'box',
            'area',
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
            expect(result.entities[0].config.aiEnabled).toBe(true)
            expect(result.entities[0].config.tendency.tendencyId).toBe('hostileExceptSelf')
                        expect(result.entities[0].health).toBe(15)
            expect(result.entities[0].position).toEqual([0, 0, 0])
            expect(result.entities[0].quaternion).toEqual([0, 0, 0, 1])
        }
    })

    it('character 装备状态 — 合法值保留，非法结构安全回退空装备（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({
            defense: {physical: 2, magic: 1},
            equipment: {
                limb: {arms: 'orc_arms'},
                weapon: {main_hand: 'long_sword', off_hand: 'shield_small'},
                armor: {head: 'iron_helmet'},
            },
        }))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.defense).toEqual({physical: 2, magic: 1})
            expect(e0.config.equipment).toEqual({
                limb: {arms: 'orc_arms'},
                weapon: {main_hand: 'long_sword', off_hand: 'shield_small'},
                armor: {head: 'iron_helmet'},
            })
        }

        /* 未知装备 id 属于运行时容错范畴：校验层保留字符串，加载时由装备解析层剔除 */
        const unknownId = validateSaveData(characterConfig({equipment: {armor: {chest: 'no_such_armor'}}}))
        const e1 = unknownId.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.equipment?.armor.chest).toBe('no_such_armor')
        }

        /* 负防御 / 非对象结构：整体回退 undefined / 空装备，不抛错 */
        expect(() => validateSaveData(characterConfig({defense: {physical: -1, magic: 0}}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({defense: 5}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({equipment: {armor: {head: 42}}}))).not.toThrow()
        const invalid = validateSaveData(characterConfig({defense: 5, equipment: {armor: {head: 42}}}))
        const e2 = invalid.entities[0]
        if (e2.type === 'character') {
            expect(e2.config.defense).toBeUndefined()
            expect(e2.config.equipment).toEqual({limb: {}, weapon: {}, armor: {}})
        }
    })

    it('character 体形专属状态 — 合法键值保留，非法结构安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({bodyState: {attackModule: 'dual_wield', handedness: 'left'}}))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.bodyState).toEqual({attackModule: 'dual_wield', handedness: 'left'})
        }

        expect(() => validateSaveData(characterConfig({bodyState: {attackModule: 42}}))).not.toThrow()
        const invalid = validateSaveData(characterConfig({bodyState: {attackModule: 42}}))
        const e1 = invalid.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.bodyState).toBeUndefined()
        }
    })

    it('character 基础攻击加成 — 可选字段：合法值保留，非法结构安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({baseAttack: {physical: 2, magic: 1}}))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.baseAttack).toEqual({physical: 2, magic: 1})
        }

        /* 负值 / 非对象结构：整体回退 undefined，不抛错 */
        expect(() => validateSaveData(characterConfig({baseAttack: {physical: -1, magic: 0}}))).not.toThrow()
        expect(() => validateSaveData(characterConfig({baseAttack: 5}))).not.toThrow()
        const invalid = validateSaveData(characterConfig({baseAttack: 5}))
        const e1 = invalid.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.baseAttack).toBeUndefined()
        }
    })

    it('character 锁定点 — 可选字段：合法值保留，非法结构安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
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

    it('character 韧性 / 倒地属性 — 可选字段：合法值保留，非法值安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({
            poiseMax: 24, poiseRegenDelay: 1.2, poiseRegenPerSec: 9, knockdownDuration: 0.8, getUpDuration: 0.7,
        }))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.poiseMax).toBe(24)
            expect(e0.config.poiseRegenDelay).toBe(1.2)
            expect(e0.config.poiseRegenPerSec).toBe(9)
            expect(e0.config.knockdownDuration).toBe(0.8)
            expect(e0.config.getUpDuration).toBe(0.7)
        }

        /* 非法值（非正上界 / 负时长 / 非数字）：单项回退 undefined，不抛错 */
        const invalid = validateSaveData(characterConfig({
            poiseMax: 0, poiseRegenDelay: -1, poiseRegenPerSec: 'x', knockdownDuration: -0.5, getUpDuration: null,
        }))
        const e1 = invalid.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.poiseMax).toBeUndefined()
            expect(e1.config.poiseRegenDelay).toBeUndefined()
            expect(e1.config.poiseRegenPerSec).toBeUndefined()
            expect(e1.config.knockdownDuration).toBeUndefined()
            expect(e1.config.getUpDuration).toBeUndefined()
        }

        /* 旧档缺字段：全部 undefined（运行时回退默认） */
        const legacy = validateSaveData(characterConfig({}))
        const e2 = legacy.entities[0]
        if (e2.type === 'character') {
            expect(e2.config.poiseMax).toBeUndefined()
            expect(e2.config.getUpDuration).toBeUndefined()
        }
    })

    it('character 体力 / 飞行 — 可选字段：合法值保留，非法值逐项回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        const valid = validateSaveData(characterConfig({
            flightEnabled: true,
            stamina: {
                max: 30, regenDelay: 1, regenPerSec: 4,
                entryCost: {attack: 1, roll: 0.5, jump: 0.25},
                drainPerSec: {sprinting: 0.3, flying: 0.1, blocking: 0.4},
            },
        }))
        const e0 = valid.entities[0]
        if (e0.type === 'character') {
            expect(e0.config.flightEnabled).toBe(true)
            expect(e0.config.stamina?.max).toBe(30)
            expect(e0.config.stamina?.entryCost?.attack).toBe(1)
            expect(e0.config.stamina?.drainPerSec?.blocking).toBe(0.4)
        }

        const invalid = validateSaveData(characterConfig({
            flightEnabled: 'yes',
            stamina: {max: 0, regenDelay: -1, regenPerSec: 'x', entryCost: {attack: -1}, drainPerSec: {flying: -2}},
        }))
        const e1 = invalid.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.flightEnabled).toBeUndefined()
            expect(e1.config.stamina?.max).toBeUndefined()
            expect(e1.config.stamina?.regenDelay).toBeUndefined()
            expect(e1.config.stamina?.regenPerSec).toBeUndefined()
            expect(e1.config.stamina?.entryCost?.attack).toBeUndefined()
            expect(e1.config.stamina?.drainPerSec?.flying).toBeUndefined()
        }

        /* 旧档缺字段：undefined / 未开启飞行（运行时回退默认） */
        const legacy = validateSaveData(characterConfig({}))
        const e2 = legacy.entities[0]
        if (e2.type === 'character') {
            expect(e2.config.flightEnabled).toBeUndefined()
            expect(e2.config.stamina).toBeUndefined()
        }
    })

    it('character 行为原点策略 / 漫游间隔 / 追击半径 — 可选字段：合法值保留，非法值安全回退 undefined（不抛错）', () => {
        const characterConfig = (extra: Record<string, unknown>) => ({
            entities: [{
                type: 'character',
                config: {
                    speed: 6, jumpHeight: 2, scale: 1,
                    tendency: {tendencyId: 'hostileExceptSelf'},
                    faction: 0, maxHealth: 15, isPlayer: false,
                    ...extra,
                },
                health: 15,
            }],
        })

        for (const strategy of ['resident', 'fighter', 'hunter', 'roamer'] as const) {
            const valid = validateSaveData(characterConfig({originStrategy: strategy, originInterval: 12, chaseLeashRadius: 30, aiBlockDuration: 0.6, aiBlockCooldown: 2, aiEnabled: false}))
            const e = valid.entities[0]
            if (e.type === 'character') {
                expect(e.config.originStrategy).toBe(strategy)
                expect(e.config.originInterval).toBe(12)
                expect(e.config.chaseLeashRadius).toBe(30)
                expect(e.config.aiBlockDuration).toBe(0.6)
                expect(e.config.aiBlockCooldown).toBe(2)
                expect(e.config.aiEnabled).toBe(false)
            }
        }

        /* 非法值（未知策略 / 非正数 / 冷却为 0 或负）：单项回退 undefined，不抛错 */
        const invalid = validateSaveData(characterConfig({originStrategy: 'nope', originInterval: 0, chaseLeashRadius: -5, aiBlockDuration: 0, aiBlockCooldown: 0}))
        const e1 = invalid.entities[0]
        if (e1.type === 'character') {
            expect(e1.config.originStrategy).toBeUndefined()
            expect(e1.config.originInterval).toBeUndefined()
            expect(e1.config.chaseLeashRadius).toBeUndefined()
            expect(e1.config.aiBlockDuration).toBeUndefined()
            expect(e1.config.aiBlockCooldown).toBeUndefined()
        }

        /* 旧档缺字段：全部 undefined（运行时回退默认） */
        const legacy = validateSaveData(characterConfig({}))
        const e2 = legacy.entities[0]
        if (e2.type === 'character') {
            expect(e2.config.originStrategy).toBeUndefined()
            expect(e2.config.originInterval).toBeUndefined()
            expect(e2.config.chaseLeashRadius).toBeUndefined()
            expect(e2.config.aiBlockDuration).toBeUndefined()
            expect(e2.config.aiBlockCooldown).toBeUndefined()
        }
    })

    it('character 缺省字段：defense / equipment / lockPoints / bodyState 均为缺省值', () => {
        const result = validateSaveData({entities: [{type: 'character'}]})
        const entity = result.entities[0]
        if (entity.type === 'character') {
            expect(entity.config.defense).toBeUndefined()
            expect(entity.config.equipment).toEqual({limb: {}, weapon: {}, armor: {}})
            expect(entity.config.lockPoints).toBeUndefined()
            expect(entity.config.bodyState).toBeUndefined()
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
        expect(parseSaveData({entities: [{type: 'character', facing: 400}]}).skipped).toHaveLength(1)
        expect(parseSaveData({entities: [{type: 'character', facing: -1}]}).skipped).toHaveLength(1)
    })

    it('最小合法存档 — box 各字段取默认值', () => {
        const data = {entities: [{type: 'box'}]}
        const result = validateSaveData(data)
        expect(result.entities).toHaveLength(1)
        expect(result.entities[0].type).toBe('box')
        if (result.entities[0].type === 'box') {
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
            /* equipment 缺失 → 空装备（天然 / 默认武器由运行时按体形补齐） */
            expect(result.entities[0].config.equipment).toEqual({limb: {}, weapon: {}, armor: {}})
        }
    })

    it('存档含未知多余字段通过校验（静默丢弃）', () => {
        const data = {
            entities: [{
                type: 'box',
                config: {width: 2, height: 2, depth: 2, mass: 1, friction: 0.3},
                position: [0, 0, 0],
                quaternion: [0, 0, 0, 1],
                extraField: 'should-be-ignored',
            }],
        }
        expect(() => validateSaveData(data)).not.toThrow()
    })
})
