import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene, type MeshStandardMaterial} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../../physics/world.ts'
import {getSurfaceGridTexture} from '../../../../render/materials/index.ts'
import {DEFAULT_SURFACE_MATERIAL, type SurfaceMaterialId} from '../../../../render/materials/ids.ts'
import {setupFragmentEntities} from './world.ts'
import type {FragmentEntityContext} from '../types'
import type {FragmentData} from '../../../destroyed/types'

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

/** 简单四面体碎片数据（4 顶点 / 4 三角面），足够驱动网格与凸包碰撞体构建 */
const tetraData = (): FragmentData => ({
    renderVertices: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
    ]),
    renderIndices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
    hullVertices: [{x: 0, y: 0, z: 0}, {x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}],
    hullFaces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
    centroid: [0, 0, 0],
    massRatio: 1,
    boxSize: [1, 1, 1],
})

const surfaceMapOf = (material: SurfaceMaterialId): unknown =>
    getSurfaceGridTexture(material)

/**
 * 碎片表面材质继承：碎片须沿用裂开前箱子的表面材质（纹理一致），
 * 缺少材质参数时回退默认材质；`updateConfig` 切换材质即时更新采样纹理。
 */
describe('fragment 表面材质继承（沿用原箱子材质）', () => {
    let ctx: FragmentEntityContext
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
        ctx = setupFragmentEntities(new Scene(), createSharedWorld())
    })

    it('add 传入 material → config 与网格材质采样该材质纹理', () => {
        const frag = ctx.add(tetraData(), '#box1-0', {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 0, w: 1}, undefined, 'wood')
        expect(frag.config.material).toBe('wood')
        const mat = frag.mesh.material as MeshStandardMaterial
        expect(mat.map).toBe(surfaceMapOf('wood'))
    })

    it('add 未传 material → 回退默认表面材质', () => {
        const frag = ctx.add(tetraData(), '#box1-0', {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 0, w: 1})
        expect(frag.config.material).toBe(DEFAULT_SURFACE_MATERIAL)
        const mat = frag.mesh.material as MeshStandardMaterial
        expect(mat.map).toBe(surfaceMapOf(DEFAULT_SURFACE_MATERIAL))
    })

    it('updateConfig 切换材质 → 采样纹理同步更新', () => {
        const frag = ctx.add(tetraData(), '#box1-0', {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 0, w: 1}, undefined, 'rock')
        ctx.updateConfig(frag.id, {material: 'brick'})
        expect(frag.config.material).toBe('brick')
        const mat = frag.mesh.material as MeshStandardMaterial
        expect(mat.map).toBe(surfaceMapOf('brick'))
    })
})
