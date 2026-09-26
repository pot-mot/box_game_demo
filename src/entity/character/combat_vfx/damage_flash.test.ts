import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Mesh, MeshStandardMaterial, Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from '../physics/world.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import {DAMAGE_FLASH_DURATION, DAMAGE_FLASH_COLOR} from './constants.ts'
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

/** 收集外观组内所有 MeshStandardMaterial 的颜色（排序后便于整体比对） */
const collectColors = (entity: CharacterEntity): number[] => {
    const colors: number[] = []
    entity.appearanceGroup.traverse((obj) => {
        if (!(obj instanceof Mesh)) return
        const list = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of list) {
            if (mat instanceof MeshStandardMaterial) colors.push(mat.color.getHex())
        }
    })
    return colors.sort((a, b) => a - b)
}

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
        applyDamage(entity.combat, {
            sourceId: -1,
            targetId: id,
            baseAmount: 5,
            finalAmount: 5,
            skillId: 'test',
        })
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

        const hit = {sourceId: -1, targetId: id, baseAmount: 2, finalAmount: 2, skillId: 'test'}
        applyDamage(entity.combat, hit)
        system.update(1 / 60)
        applyDamage(entity.combat, hit)

        for (let i = 0; i < 30; i++) system.update(1 / 60)
        expect(collectColors(entity)).toEqual(recolored)
    })

    it('闪红时长常量覆盖 tick 累加（防回归）', () => {
        expect(DAMAGE_FLASH_DURATION).toBeGreaterThan(0)
    })
})
