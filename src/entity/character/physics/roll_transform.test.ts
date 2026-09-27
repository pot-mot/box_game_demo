import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {MODEL_BASE_HEIGHT} from '../../../render/constants.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/** 帧步长（与物理固定步长一致） */
const DT = 1 / 60

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩 */
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

/**
 * 翻滚根变换（world 层合成）：
 * - 自转 2π 绕**身体中心**而非脚底原点（位置补偿 center − Q·center），否则绕脚底划大圈/沉入地面；
 * - 结束帧根旋转归位为纯 yaw、位置回到脚底原点。
 * 帧序与 main.ts 一致：syncPositions() 写绝对原点 → update() 叠加翻滚合成。
 */
describe('翻滚根旋转与绕身体中心补偿', () => {
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

    it('中段绕身体中心自转：模型中心与胶囊中心重合；结束后脚底原点与纯 yaw 归位', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        const group = entity.appearanceGroup
        const halfH = (CHARACTER_BASE_SIZE.height * entity.config.scale) / 2
        /* 模型原点在脚底、总高 MODEL_BASE_HEIGHT，视觉中心在本地 Y = 半高（× scale 得世界偏移基数） */
        const modelCenterOffset = (MODEL_BASE_HEIGHT * entity.config.scale) / 2

        const step = (): void => {
            system.syncPositions()
            system.update(DT)
        }

        entity.stateMachine.setInput(0, 0, false, false, true)
        step()
        expect(entity.stateMachine.currentState).toBe('rolling')

        /* 推进到中段（约 0.23s）：已转过明显角度，且模型中心仍贴合胶囊中心 */
        for (let i = 0; i < 14; i++) step()
        expect(entity.stateMachine.currentState).toBe('rolling')
        const mid = entity.body.translation()
        const center = new Vector3(0, modelCenterOffset, 0).applyQuaternion(group.quaternion).add(group.position)
        expect(Math.abs(group.quaternion.x)).toBeGreaterThan(0.3)
        expect(center.x).toBeCloseTo(mid.x, 5)
        expect(center.y).toBeCloseTo(mid.y, 5)
        expect(center.z).toBeCloseTo(mid.z, 5)

        /* 翻滚结束：位置回脚底原点、旋转只剩朝向 yaw */
        for (let i = 0; i < 40; i++) step()
        expect(entity.stateMachine.currentState).not.toBe('rolling')
        const after = entity.body.translation()
        expect(group.position.x).toBeCloseTo(after.x, 5)
        expect(group.position.y).toBeCloseTo(after.y - halfH, 5)
        expect(group.position.z).toBeCloseTo(after.z, 5)
        expect(Math.abs(group.quaternion.x)).toBeLessThan(1e-6)
        expect(Math.abs(group.quaternion.z)).toBeLessThan(1e-6)
    })
})
