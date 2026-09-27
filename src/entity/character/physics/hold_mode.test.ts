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
    attack: {weaponId: 'long_sword', damage: 3},
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

    it('默认单持；副手为同类近战时双持可用，否则 setHoldMode 回退默认并返回 false', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        expect(entity.holdMode).toBe('one_handed')

        /* 无副手：双持请求被拒绝（回退默认单持） */
        expect(system.setHoldMode(id, 'dual_wield')).toBe(false)
        expect(entity.holdMode).toBe('one_handed')
        /* 双手共持始终可用 */
        expect(system.setHoldMode(id, 'two_handed')).toBe(true)
        expect(entity.holdMode).toBe('two_handed')
        expect(system.setHoldMode(id, 'one_handed')).toBe(true)
    })

    it('副手同类近战（经 updateCharacterConfig 装配）：双持可用且副手回手；双手共持时副手挂背', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!

        /* 装备同类副手（长剑） */
        system.updateCharacterConfig(id, {}, characterConfig().attack, undefined, undefined, undefined, undefined, undefined, {weaponId: 'long_sword'})
        expect(entity.combat.offhand?.weapon.id).toBe('long_sword')
        expect(system.setHoldMode(id, 'dual_wield')).toBe(true)
        expect(entity.holdMode).toBe('dual_wield')
        const leftMount = findJoint(entity, 'leftWeaponMount')!
        const backMount = findJoint(entity, 'backWeaponMount')!
        expect(leftMount.children).toHaveLength(1)
        expect(backMount.children).toHaveLength(0)

        /* 双手共持：副手换父节点到背部挂点（同一 Group，不重建） */
        const offhandGroup = leftMount.children[0]
        expect(system.setHoldMode(id, 'two_handed')).toBe(true)
        expect(leftMount.children).toHaveLength(0)
        expect(backMount.children).toHaveLength(1)
        expect(backMount.children[0]).toBe(offhandGroup)

        /* 回单持：副手回手 */
        expect(system.setHoldMode(id, 'one_handed')).toBe(true)
        expect(leftMount.children).toHaveLength(1)
        expect(backMount.children).toHaveLength(0)
    })

    it('不同类别副手（远程）不构成双持：请求回退单持', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        system.updateCharacterConfig(id, {}, characterConfig().attack, undefined, undefined, undefined, undefined, undefined, {weaponId: 'longbow'})
        expect(entity.combat.offhand?.weapon.id).toBe('longbow')
        expect(system.setHoldMode(id, 'dual_wield')).toBe(false)
        expect(entity.holdMode).toBe('one_handed')
    })

    it('玩家持握环切：单持 → 双手共持 → 双持（有同类副手时）→ 单持', () => {
        const {id} = system.add(characterConfig(), 0, 0, 0)
        system.markPlayer(id)
        system.updateCharacterConfig(id, {}, characterConfig().attack, undefined, undefined, undefined, undefined, undefined, {weaponId: 'long_sword'})
        const entity = system.getAll().find(e => e.id === id)!

        expect(system.cyclePlayerHoldMode()).toBe('two_handed')
        expect(system.cyclePlayerHoldMode()).toBe('dual_wield')
        expect(system.cyclePlayerHoldMode()).toBe('one_handed')
        expect(entity.holdMode).toBe('one_handed')
    })

    it('存档：未知副手武器 id 安全丢弃；合法副手与持握模式按存档恢复', () => {
        const {id} = system.add(characterConfig({
            offhand: {weaponId: 'no_such_weapon'},
            holdMode: 'dual_wield',
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        /* 未知副手被丢弃 → 双持不可用 → 回退默认单持 */
        expect(entity.combat.offhand).toBeUndefined()
        expect(entity.holdMode).toBe('one_handed')

        const {id: id2} = system.add(characterConfig({
            offhand: {weaponId: 'long_sword'},
            holdMode: 'dual_wield',
        }), 1, 0, 0)
        const entity2 = system.getAll().find(e => e.id === id2)!
        expect(entity2.combat.offhand?.weapon.id).toBe('long_sword')
        expect(entity2.holdMode).toBe('dual_wield')
    })
})
