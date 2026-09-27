import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Mesh, MeshStandardMaterial, Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from '../physics/world.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import {DAMAGE_FLASH_DURATION, DAMAGE_FLASH_COLOR, INVINCIBLE_FLASH_COLOR, INVINCIBLE_FLASH_OPACITY} from './constants.ts'
import {createMaterialEffects} from './material_effects.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import type {CharacterEntity} from '../../../character/types.ts'

/** happy-dom 不支持 canvas 2d，这里注入一个最小 2d 上下文桩（仅覆盖 model.ts 用到的方法） */
const canvasCtxStub = (): Record<string, unknown> => ({
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
})

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

const meleeSaveConfig = (): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {weaponId: 'long_sword', damage: 3},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
})

/** 收集外观组内所有 MeshStandardMaterial（含护甲与武器） */
const collectMaterials = (entity: CharacterEntity): MeshStandardMaterial[] => {
    const materials: MeshStandardMaterial[] = []
    entity.appearanceGroup.traverse((obj) => {
        if (!(obj instanceof Mesh)) return
        const list = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of list) {
            if (mat instanceof MeshStandardMaterial) materials.push(mat)
        }
    })
    return materials
}

/** 收集外观组内所有 MeshStandardMaterial 的颜色（排序后便于整体比对） */
const collectColors = (entity: CharacterEntity): number[] =>
    collectMaterials(entity).map(mat => mat.color.getHex()).sort((a, b) => a - b)

const hitEvent = (id: number) => ({
    sourceId: -1,
    targetId: id,
    damageType: 'physical' as const,
    baseAmount: 5,
    finalAmount: 5,
    skillId: 'test',
})

describe('受击闪红颜色恢复', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        system = setupCharacterEntities(new Scene(), createSharedWorld())
    })

    it('编辑模式改阵营后受击，闪红结束恢复的是新阵营色而非初始阵营色', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        const spawnColors = collectColors(entity)

        /* 改阵营 0 → 2：recolor 应改变身体材质颜色 */
        system.updateCharacterConfig(id, {}, undefined, 2)
        const recolored = collectColors(entity)
        expect(recolored).not.toEqual(spawnColors)

        /* 受击 → 闪红 → 结束后颜色必须回到「改阵营后」的颜色 */
        applyDamage(entity.combat, hitEvent(id))
        expect(collectColors(entity)).toContain(DAMAGE_FLASH_COLOR)

        for (let i = 0; i < 30; i++) system.update(1 / 60)
        expect(collectColors(entity)).toEqual(recolored)
        expect(collectColors(entity)).not.toEqual(spawnColors)
    })

    it('闪红持续期间内再次受击，结束后仍恢复当前外观颜色', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        system.updateCharacterConfig(id, {}, undefined, 3)
        const recolored = collectColors(entity)

        applyDamage(entity.combat, hitEvent(id))
        system.update(1 / 60)
        applyDamage(entity.combat, hitEvent(id))

        for (let i = 0; i < 30; i++) system.update(1 / 60)
        expect(collectColors(entity)).toEqual(recolored)
    })

    it('闪红时长常量覆盖 tick 累加（防回归）', () => {
        expect(DAMAGE_FLASH_DURATION).toBeGreaterThan(0)
    })
})

describe('翻滚无敌帧材质表现与伤害免疫', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        system = setupCharacterEntities(new Scene(), createSharedWorld())
    })

    /** 直接驱动实体状态机进入翻滚（世界未标记玩家，输入持久保留） */
    const startRoll = (entity: CharacterEntity): void => {
        entity.stateMachine.setInput(0, 0, false, false, true)
    }

    /** 单帧推进：帧序与 main.ts 一致（syncPositions 写绝对原点 → update 叠加状态/表现） */
    const step = (): void => {
        system.syncPositions()
        system.update(1 / 60)
    }

    it('中段无敌帧：材质半透明白、伤害完全免疫；窗口结束后恢复外观并恢复结算', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        const baseColors = collectColors(entity)
        const baseOpacities = collectMaterials(entity).map(mat => mat.opacity)

        startRoll(entity)
        step()
        expect(entity.stateMachine.currentState).toBe('rolling')

        /* 起手（窗口前）可被命中 */
        expect(entity.combat.invincibleTimer).toBe(0)

        /* 推进到中段窗口（无敌帧 0.15s ~ 0.45s；第 12 帧 stateTime≈0.183s） */
        for (let i = 0; i < 11; i++) step()
        expect(entity.combat.invincibleTimer).toBeGreaterThan(0)
        for (const mat of collectMaterials(entity)) {
            expect(mat.color.getHex()).toBe(INVINCIBLE_FLASH_COLOR)
            expect(mat.transparent).toBe(true)
            expect(mat.opacity).toBeCloseTo(INVINCIBLE_FLASH_OPACITY)
        }

        /* 无敌期间伤害完全免疫：不扣血、不触发闪红 */
        const healthBefore = entity.combat.health
        applyDamage(entity.combat, hitEvent(id))
        expect(entity.combat.health).toBe(healthBefore)
        expect(collectColors(entity)).not.toContain(DAMAGE_FLASH_COLOR)

        /* 翻滚结束（0.6s）后外观还原、无敌解除 */
        for (let i = 0; i < 40; i++) step()
        expect(entity.stateMachine.currentState).not.toBe('rolling')
        for (const mat of collectMaterials(entity)) {
            expect(mat.transparent).toBe(false)
        }
        expect(collectColors(entity)).toEqual(baseColors)
        collectMaterials(entity).forEach((mat, i) => expect(mat.opacity).toBe(baseOpacities[i]))

        applyDamage(entity.combat, hitEvent(id))
        expect(entity.combat.health).toBe(healthBefore - 5)
    })

    it('统一效果层优先级：无敌闪白期间受击显示闪红，无敌结束回到闪白，全部结束恢复原色', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        const effects = createMaterialEffects(entity)
        const baseColors = collectColors(entity)

        effects.setInvincible(true)
        expect(collectColors(entity)).toContain(INVINCIBLE_FLASH_COLOR)

        effects.onDamage(1)
        expect(collectColors(entity)).toContain(DAMAGE_FLASH_COLOR)
        expect(collectColors(entity)).not.toContain(INVINCIBLE_FLASH_COLOR)

        effects.tick(DAMAGE_FLASH_DURATION)
        expect(collectColors(entity)).toContain(INVINCIBLE_FLASH_COLOR)

        effects.setInvincible(false)
        expect(collectColors(entity)).toEqual(baseColors)
    })
})
