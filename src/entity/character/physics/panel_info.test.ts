import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Mesh, Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {CharacterEntity} from '../../../character/types.ts'

/** happy-dom 不支持 canvas 2d，这里注入一个最小 2d 上下文桩（仅覆盖 model.ts 用到的方法） */
const canvasCtxStub = (): Record<string, unknown> => {
    const ctx: Record<string, unknown> = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        lineCap: '',
        fillRect: () => {},
        beginPath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        ellipse: () => {},
    }
    return ctx
}

/* 在 patch 前捕获原始实现，供 restore 恢复 */
const originalGetContext = HTMLCanvasElement.prototype.getContext

const patchCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
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

const meleeSaveConfig = (overrides?: Partial<CharacterSaveConfig>): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {
        weaponId: 'long_sword',
        damage: 3,
    },
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
    ...overrides,
})

/** 面板改装用的攻击配置（武器沿用长剑，只改伤害覆写） */
const meleeAttack = (damage: number): AttackConfig => ({
    weaponId: 'long_sword',
    damage,
})

/** 统计外观组内 Mesh 数量（护甲装配/移除的可观测信号） */
const countMeshes = (entity: CharacterEntity): number => {
    let count = 0
    entity.appearanceGroup.traverse(obj => {
        if (obj instanceof Mesh) count++
    })
    return count
}

/** 查找某挂载关节上的基础身体部件（外观装配写入 userData.jointId；护甲网格不写该字段） */
const findJointPart = (entity: CharacterEntity, jointId: string): Mesh | undefined => {
    let found: Mesh | undefined
    entity.appearanceGroup.traverse(obj => {
        if (found === undefined && obj instanceof Mesh && obj.userData.jointId === jointId) found = obj
    })
    return found
}

describe('角色 panelInfo 同步', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        /* 注入 canvas 2d 桩，使真实 createCharacterModel 可在 happy-dom 下运行 */
        patchCanvas2d()
        /* 屏蔽 three 对材质 map=undefined 的警告噪音 */
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        const scene = new Scene()
        const shared = createSharedWorld()
        system = setupCharacterEntities(scene, shared)
    })

    it('add() 加载角色后（未执行物理同步）panelInfo 即含完整信息', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const row = system.panelInfo.find(p => p.id === id)
        expect(row).toBeDefined()
        expect(row!.rowText).not.toBe(`Character #${id}`)
        expect(row!.rowText).toContain('HP:15/15')
        /* 武器段展示中文名（武器预设 name 字段），不展示英文 id */
        expect(row!.rowText).toContain('长剑(3)')
        expect(row!.rowText).not.toContain('long_sword')
        expect(row!.rowText).toContain('spd:6')
        expect(row!.rowText).toContain('[idle]')
        expect(row!.badgeLabel).toBe('F0')
    })

    it('add() 加载角色后反映自定义 maxHealth/health', () => {
        const {id} = system.add(meleeSaveConfig({maxHealth: 20}), 0, 0, 0, undefined, {health: 12})
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('HP:12/20')
    })

    it('updateCharacterConfig 编辑后 panelInfo 立即反映（无需 syncPositions）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.updateCharacterConfig(
            id,
            {speed: 9},
            meleeAttack(5),
            2,
            20,
            {tendencyId: 'pacifist'},
            12,
        )
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('HP:12/20')
        expect(row!.rowText).toContain('长剑(5)')
        expect(row!.rowText).toContain('spd:9')
        expect(row!.badgeLabel).toBe('F2')
    })

    it('add() 带护甲与基础防御：有效防御 = 基础 + 各护甲之和，未知护甲 id 安全回退', () => {
        const {id} = system.add(meleeSaveConfig({
            defense: {physical: 1, magic: 0},
            armor: {head: 'iron_helmet', chest: 'no_such_armor', legs: 'mage_leggings'},
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        /* chest 未知 id 回退空槽：物理 1+2，魔法 0+2 */
        expect(entity.combat.defense).toEqual({physical: 3, magic: 2})
        /* 原始装备表保留（未知 id 不写回） */
        expect(entity.combat.armor).toEqual({head: 'iron_helmet', chest: 'no_such_armor', legs: 'mage_leggings'})
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('def:物3/魔2')
    })

    it('add() 装备攻击加成与移速乘数：按类别区分、多件相乘并反映到列表行', () => {
        const {id} = system.add(meleeSaveConfig({
            /* 法师兜帽（魔攻+1）、战臂甲（物攻+2、移速×0.97）、疾行靴（移速×1.15） */
            armor: {head: 'mage_hood', arms: 'battle_bracers', legs: 'swift_boots'},
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        expect(entity.combat.attackBonus).toEqual({physical: 2, magic: 1})
        expect(entity.combat.moveSpeedMultiplier).toBeCloseTo(0.97 * 1.15, 6)
        /* 列表行展示有效移速（6 × 0.97 × 1.15 = 6.69） */
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('spd:6.69')
    })

    it('updateCharacterConfig 装备护甲后立即重算有效防御并同步 panelInfo', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            baseDefense: {physical: 0, magic: 1},
            armor: {chest: 'iron_plate'},
        })
        const entity = system.getAll().find(e => e.id === id)!
        expect(entity.combat.defense).toEqual({physical: 3, magic: 1})
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('def:物3/魔1')
    })

    it('updateCharacterConfig 换装重甲与加速鞋：防御 / 攻击 / 移速一并重算', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            baseDefense: {physical: 0, magic: 1},
            armor: {chest: 'iron_plate', arms: 'iron_bracers', legs: 'wind_boots'},
        })
        const entity = system.getAll().find(e => e.id === id)!
        expect(entity.combat.defense).toEqual({physical: 5, magic: 2})
        expect(entity.combat.attackBonus).toEqual({physical: 1, magic: 0})
        /* 铁胸甲 ×0.9 × 疾风靴 ×1.25 = 1.125 → 有效移速 6.75 */
        expect(entity.combat.moveSpeedMultiplier).toBeCloseTo(1.125, 6)
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('spd:6.75')
    })

    it('护甲外观随装备同步装配与移除（换装不残留部件）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        const before = countMeshes(entity)

        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            armor: {head: 'iron_helmet', chest: 'iron_plate'},
        })
        expect(countMeshes(entity)).toBeGreaterThan(before)

        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {armor: {}})
        expect(countMeshes(entity)).toBe(before)
    })

    it('护甲 hideBodyParts 顶替身体部件：装备后隐藏、卸下后还原', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!

        /* 疾行靴顶替小腿；铁盔 / 铁胸甲为叠加件，头部与躯干保持可见 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            armor: {head: 'iron_helmet', chest: 'iron_plate', legs: 'swift_boots'},
        })
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(true)
        expect(findJointPart(entity, 'spine')!.visible).toBe(true)
        expect(findJointPart(entity, 'rightLegHip')!.visible).toBe(true)
        expect(findJointPart(entity, 'leftLegHip')!.visible).toBe(true)
        expect(findJointPart(entity, 'rightLegKnee')!.visible).toBe(false)
        expect(findJointPart(entity, 'leftLegKnee')!.visible).toBe(false)

        /* 卸下后小腿还原可见 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {armor: {}})
        expect(findJointPart(entity, 'rightLegKnee')!.visible).toBe(true)
        expect(findJointPart(entity, 'leftLegKnee')!.visible).toBe(true)
    })

    it('markPlayer 后 panelInfo 立即反映玩家标记与徽标', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.markPlayer(id)
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('▶ Player:')
        expect(row!.badgeLabel).toBe('P')
    })

    it('remove 角色后 panelInfo 同步移除该行', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.remove(id)
        expect(system.panelInfo.find(p => p.id === id)).toBeUndefined()
    })

    it('update() 每帧将状态段与状态机当前状态同步（离开 idle 后行文本跟随变化）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.markPlayer(id)
        system.setPlayerMove(1, 0, false, 1, 0)
        system.update(1 / 60)
        const entity = system.getAll().find(e => e.id === id)!
        const row = system.panelInfo.find(p => p.id === id)
        /* 有移动输入后状态机离开 idle，状态段须即时反映 */
        expect(entity.stateMachine.currentState).not.toBe('idle')
        expect(row!.rowText).toContain(`[${entity.stateMachine.currentState}]`)
        system.setPlayerMove(0, 0, false, 1, 0)
    })

    it('角色刚体质量恒为 1（击退力度回归保护），修改 scale 不影响质量', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        expect(entity!.body.mass()).toBeCloseTo(1, 6)
        /* 重建碰撞体（scale 变化）后质量仍为 1 */
        system.updateCharacterConfig(id, {scale: 2})
        expect(entity!.body.mass()).toBeCloseTo(1, 6)
    })
})
