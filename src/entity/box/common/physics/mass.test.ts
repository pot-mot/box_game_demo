import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../../physics/world.ts'
import {setupCommonBoxes} from './world.ts'
import type {CommonEntityContext} from '../types'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（gridMaskTexture 需要） */
const canvasCtxStub = (): Record<string, unknown> => {
    const ctx: Record<string, unknown> = {
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fillRect: () => {},
    }
    return ctx
}

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

/**
 * 箱子刚体质量回归测试：
 * Rapier 迁移后若不显式设置质量，动态箱子按「密度 1 × 体积」计算，
 * config.mass 完全不参与物理（1×1×1 箱子 config.mass=5 实际只有 1）。
 */
describe('common 箱子刚体质量（config.mass 参与物理）', () => {
    let ctx: CommonEntityContext
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
        /* 屏蔽 three 对材质 map=undefined 的警告噪音 */
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        ctx = setupCommonBoxes(new Scene(), createSharedWorld())
    })

    it('add mass=5 → 刚体质量 5', () => {
        const box = ctx.add({width: 1, height: 1, depth: 1, mass: 5, friction: 0.5}, 0, 0.5, 0)
        expect(box.body.mass()).toBeCloseTo(5, 6)
    })

    it('add mass=0 → 静态刚体', () => {
        const box = ctx.add({width: 1, height: 1, depth: 1, mass: 0, friction: 0.5}, 0, 0.5, 0)
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed)
    })

    it('updateConfig mass 5→8 → 刚体质量同步为 8', () => {
        const box = ctx.add({width: 1, height: 1, depth: 1, mass: 5, friction: 0.5}, 0, 0.5, 0)
        ctx.updateConfig(box.id, {mass: 8})
        expect(box.body.mass()).toBeCloseTo(8, 6)
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic)
    })

    it('updateConfig mass→0 → 切换为静态刚体；再改回动态同步质量', () => {
        const box = ctx.add({width: 1, height: 1, depth: 1, mass: 5, friction: 0.5}, 0, 0.5, 0)
        ctx.updateConfig(box.id, {mass: 0})
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed)
        ctx.updateConfig(box.id, {mass: 3})
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic)
        expect(box.body.mass()).toBeCloseTo(3, 6)
    })

    it('改尺寸不影响质量（密度 0，质量与体积解耦）', () => {
        const box = ctx.add({width: 1, height: 1, depth: 1, mass: 5, friction: 0.5}, 0, 0.5, 0)
        ctx.updateConfig(box.id, {width: 2, height: 2, depth: 2})
        expect(box.body.mass()).toBeCloseTo(5, 6)
    })
})
