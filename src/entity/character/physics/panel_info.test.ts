import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

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
    attackSlot: {
        type: 'melee',
        weaponId: 'long_sword',
        range: 1.5,
        damage: 3,
        cooldown: 0.5,
        duration: 0.3,
    },
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
    ...overrides,
})

const meleeAttackSlot = (damage: number): CharacterSaveConfig['attackSlot'] => ({
    type: 'melee',
    weaponId: 'long_sword',
    range: 1.5,
    damage,
    cooldown: 0.5,
    duration: 0.3,
})

describe('角色 panelInfo 同步', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(() => {
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
        expect(row!.rowText).toContain('long_sword(3)')
        expect(row!.rowText).toContain('spd:6')
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
            meleeAttackSlot(5),
            2,
            20,
            {tendencyId: 'pacifist'},
            12,
        )
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.rowText).toContain('HP:12/20')
        expect(row!.rowText).toContain('long_sword(5)')
        expect(row!.rowText).toContain('spd:9')
        expect(row!.badgeLabel).toBe('F2')
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
})
