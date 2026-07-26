import {describe, it, expect, vi, beforeEach} from 'vitest'

const mockRotateX = vi.fn()
const mockSceneAdd = vi.fn()
const cameraPos = {x: 5, y: 2, z: 10}

vi.mock('three', () => ({
    Scene: class MockScene { add = mockSceneAdd },
    PerspectiveCamera: class MockPerspectiveCamera { position = cameraPos },
    PlaneGeometry: class MockPlaneGeometry {
        rotateX = mockRotateX
        constructor(_width: number, _height: number) {}
    },
    ShaderMaterial: class MockShaderMaterial {
        uniforms: Record<string, unknown> = {}
        constructor(_opts: Record<string, unknown>) {}
    },
    Mesh: class MockMesh {
        position = {x: 0, y: 0, z: 0}
        constructor(_geo: unknown, _mat: unknown) {}
    },
    Color: class MockColor { constructor(_hex: number) {} },
    DoubleSide: 0,
}))

import {Scene, PerspectiveCamera} from 'three'
import {setupInfiniteGrid} from './grid.ts'

describe('setupInfiniteGrid', () => {
    let scene: Scene
    let camera: PerspectiveCamera

    beforeEach(() => {
        mockRotateX.mockClear()
        mockSceneAdd.mockClear()
        cameraPos.x = 5
        cameraPos.y = 2
        cameraPos.z = 10
        scene = new Scene()
        camera = new PerspectiveCamera()
    })

    it('返回清理函数', () => {
        const cleanup = setupInfiniteGrid(scene, camera)
        expect(typeof cleanup).toBe('function')
    })

    it('PlaneGeometry 绕 X 轴旋转 -90° 对齐地平面', () => {
        setupInfiniteGrid(scene, camera)
        expect(mockRotateX).toHaveBeenCalledWith(-Math.PI / 2)
    })

    it('Mesh 被添加到 scene', () => {
        setupInfiniteGrid(scene, camera)
        expect(mockSceneAdd).toHaveBeenCalled()
    })

    it('清理函数不抛出异常', () => {
        const cleanup = setupInfiniteGrid(scene, camera)
        expect(() => cleanup()).not.toThrow()
    })

    it('不同调用返回独立清理函数', () => {
        const camera2 = new PerspectiveCamera()
        camera2.position.x = 0
        camera2.position.z = 0
        const c1 = setupInfiniteGrid(scene, camera)
        const c2 = setupInfiniteGrid(scene, camera2)
        expect(c1).not.toBe(c2)
    })
})
