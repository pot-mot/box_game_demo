import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {createPhysicsEnv} from '../../../physics/env.ts'
import {createVelocitySnapshots} from '../../../physics/velocity_snapshots.ts'
import {setupFragmentEntities} from '../../fragment/common/physics/world.ts'
import {setupBoxes} from './world.ts'
import type {BoxEntityContext, BoxConfig} from '../types'
import {DEFAULT_BOX_CONFIG} from '../validation.ts'

/**
 * happy-dom 不支持 canvas 2d，注入 2d 上下文桩（表面材质纹理 / 网格遮罩纹理需要）。
 * 用 Proxy 吞掉全部绘制调用：纹理生成只关心「不抛错」，像素内容在单测中无意义。
 */
const canvasCtxStub = (): unknown => new Proxy({}, {
    get: () => () => undefined,
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

/** 组装完整箱子配置（补齐 material 等默认值） */
const boxConfig = (over: Partial<BoxConfig>): BoxConfig => ({
    ...DEFAULT_BOX_CONFIG,
    width: 1, height: 1, depth: 1, mass: 1, friction: 0.5,
    ...over,
})

/**
 * 箱子刚体质量回归测试：
 * Rapier 迁移后若不显式设置质量，动态箱子按「密度 1 × 体积」计算，
 * config.mass 完全不参与物理（1×1×1 箱子 config.mass=5 实际只有 1）。
 */
describe('unified box 刚体质量（config.mass 参与物理）', () => {
    let ctx: BoxEntityContext
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
        const scene = new Scene()
        const shared = createSharedWorld()
        const physicsEnv = createPhysicsEnv()
        const velocitySnapshots = createVelocitySnapshots(shared.eventBus, () => physicsEnv.getAllBodies())
        const fragmentCtx = setupFragmentEntities(scene, shared)
        ctx = setupBoxes(scene, shared, {fragmentCtx, velocitySnapshots, physicsEnv})
    })

    it('add mass=5 → 刚体质量 5', () => {
        const box = ctx.add(boxConfig({mass: 5}), 0, 0.5, 0)
        expect(box.body.mass()).toBeCloseTo(5, 6)
    })

    it('add mass=0 → 静态刚体', () => {
        const box = ctx.add(boxConfig({mass: 0}), 0, 0.5, 0)
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed)
    })

    it('updateConfig mass 5→8 → 刚体质量同步为 8', () => {
        const box = ctx.add(boxConfig({mass: 5}), 0, 0.5, 0)
        ctx.updateConfig(box.id, {mass: 8})
        expect(box.body.mass()).toBeCloseTo(8, 6)
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic)
    })

    it('updateConfig mass→0 → 切换为静态刚体；再改回动态同步质量', () => {
        const box = ctx.add(boxConfig({mass: 5}), 0, 0.5, 0)
        ctx.updateConfig(box.id, {mass: 0})
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed)
        ctx.updateConfig(box.id, {mass: 3})
        expect(box.body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic)
        expect(box.body.mass()).toBeCloseTo(3, 6)
    })

    it('改尺寸不影响质量（密度 0，质量与体积解耦）', () => {
        const box = ctx.add(boxConfig({mass: 5}), 0, 0.5, 0)
        ctx.updateConfig(box.id, {width: 2, height: 2, depth: 2})
        expect(box.body.mass()).toBeCloseTo(5, 6)
    })
})
