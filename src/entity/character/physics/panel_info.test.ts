import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
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
    damage,
    cooldown: 0.5,
    duration: 0.3,
})

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
            meleeAttackSlot(5),
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
