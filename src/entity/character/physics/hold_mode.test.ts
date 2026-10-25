import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest'
import {Scene, type Object3D} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/** happy-dom 不支持 canvas 2d：注入最小上下文桩（外观装配用） */
const originalGetContext = HTMLCanvasElement.prototype.getContext

const patchCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => ({
            fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
            fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {}, ellipse: () => {},
        }),
        configurable: true,
        writable: true,
    })
}

const restoreCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
}

const characterConfig = (overrides: Partial<CharacterSaveConfig> = {}): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: true,
    ...overrides,
})

/** 在角色外观组中按关节名查找挂点 Group（模型关节 Group 以关节 id 命名） */
const findJoint = (entity: {appearanceGroup: Object3D}, jointId: string): Object3D | undefined => {
    let found: Object3D | undefined
    entity.appearanceGroup.traverse(obj => {
        if (obj.name === jointId && found === undefined) found = obj
    })
    return found
}

describe('持握模式运行时（setHoldMode / cyclePlayerHoldMode / 副手挂背）', () => {
    let system: CharacterEntitySystem

    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
    })

    afterAll(() => {
        restoreCanvas2d()
    })

    beforeEach(() => {
        system = setupCharacterEntities(new Scene(), createSharedWorld())
    })

    it('默认生成角色双手均填充空手武器（副手不留空）', () => {
        const {id} = system.add(characterConfig({equipment: {limb: {}, weapon: {}, armor: {}}}), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.combat.weapon.id).toBe('unarmed')
        expect(entity.state.combat.offhand?.weapon.id).toBe('unarmed')
    })

    it('主手 / 副手攻击数值覆写独立保留', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        system.updateCharacterConfig(
            id,
            {},
            {weaponId: 'long_sword', damage: 11, cooldown: 0.7},
            undefined, undefined, undefined, undefined,
            {equipment: {limb: {}, weapon: {main_hand: 'long_sword', off_hand: 'short_sword'}, armor: {}}},
            {weaponId: 'short_sword', damage: 7, cooldown: 0.9},
        )
        expect(entity.state.combat.weapon.damage).toBe(11)
        expect(entity.state.combat.offhand?.weapon.damage).toBe(7)
        const mainEntry = entity.state.combat.weapons.get('main_hand')!.attacks.chains.light.entries[0]!.segmentId
        const offEntry = entity.state.combat.weapons.get('off_hand')!.attacks.chains.light.entries[0]!.segmentId
        expect(entity.state.combat.weapons.get('main_hand')!.attacks.segments[mainEntry]!.cooldown).toBe(0.7)
        expect(entity.state.combat.weapons.get('off_hand')!.attacks.segments[offEntry]!.cooldown).toBe(0.9)
    })

    it('默认单持；副手为同类近战时双持可用，否则 setHoldMode 回退默认并返回 false', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.combat.attackModule).toBe('one_handed')

        /* 副手默认天然手，与主手长剑不同类：双持请求被拒绝（回退默认单持） */
        expect(system.setAttackModule(id, 'dual_wield')).toBe(false)
        expect(entity.state.combat.attackModule).toBe('one_handed')
        /* 双手共持始终可用 */
        expect(system.setAttackModule(id, 'two_handed')).toBe(true)
        expect(entity.state.combat.attackModule).toBe('two_handed')
        expect(system.setAttackModule(id, 'one_handed')).toBe(true)
    })

    it('副手同类近战（经 updateCharacterConfig 装配）：双持可用且副手回手；双手共持时副手挂背', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!

        /* 装备同类副手（长剑） */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, undefined, {weaponId: 'long_sword'})
        expect(entity.state.combat.offhand?.weapon.id).toBe('long_sword')
        expect(system.setAttackModule(id, 'dual_wield')).toBe(true)
        expect(entity.state.combat.attackModule).toBe('dual_wield')
        const leftMount = findJoint(entity, 'leftWeaponMount')!
        const backMount = findJoint(entity, 'backWeaponMount')!
        expect(leftMount.children).toHaveLength(1)
        expect(backMount.children).toHaveLength(0)

        /* 双手共持：副手换父节点到背部挂点（同一 Group，不重建） */
        const offhandGroup = leftMount.children[0]
        expect(system.setAttackModule(id, 'two_handed')).toBe(true)
        expect(leftMount.children).toHaveLength(0)
        expect(backMount.children).toHaveLength(1)
        expect(backMount.children[0]).toBe(offhandGroup)

        /* 回单持：副手回手 */
        expect(system.setAttackModule(id, 'one_handed')).toBe(true)
        expect(leftMount.children).toHaveLength(1)
        expect(backMount.children).toHaveLength(0)
    })

    it('不同类别副手（远程）不构成双持：请求回退单持', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, undefined, {weaponId: 'longbow'})
        expect(entity.state.combat.offhand?.weapon.id).toBe('longbow')
        expect(system.setAttackModule(id, 'dual_wield')).toBe(false)
        expect(entity.state.combat.attackModule).toBe('one_handed')
    })

    it('玩家持握环切：单持 → 双手共持 → 双持（有同类副手时）→ 单持', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        system.markPlayer(id)
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, undefined, {weaponId: 'long_sword'})
        const entity = system.getAll().find(e => e.state.identity.id === id)!

        expect(system.cyclePlayerAttackModule()).toBe('two_handed')
        expect(system.cyclePlayerAttackModule()).toBe('dual_wield')
        expect(system.cyclePlayerAttackModule()).toBe('one_handed')
        expect(entity.state.combat.attackModule).toBe('one_handed')
    })

    it('存档：未知副手武器 id 安全丢弃；合法副手与持握模式按存档恢复', () => {
        const {id} = system.add(characterConfig({
            equipment: {limb: {}, weapon: {main_hand: 'long_sword', off_hand: 'no_such_weapon'}, armor: {}},
            bodyState: {attackModule: 'dual_wield'},
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        /* 未知副手被回填为天然手 → 与主手不同类 → 双持不可用 → 回退默认单持 */
        expect(entity.state.combat.offhand?.weapon.id).toBe('unarmed')
        expect(entity.state.combat.attackModule).toBe('one_handed')

        const {id: id2} = system.add(characterConfig({
            equipment: {limb: {}, weapon: {main_hand: 'long_sword', off_hand: 'long_sword'}, armor: {}},
            bodyState: {attackModule: 'dual_wield'},
        }), 1, 0, 0)
        const entity2 = system.getAll().find(e => e.state.identity.id === id2)!
        expect(entity2.state.combat.offhand?.weapon.id).toBe('long_sword')
        expect(entity2.state.combat.attackModule).toBe('dual_wield')
    })
})
