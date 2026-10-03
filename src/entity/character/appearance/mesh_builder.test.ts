import {describe, it, expect, vi} from 'vitest'
import {
    BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, SphereGeometry,
} from 'three'
import {createMeshBuilder} from './mesh_builder.ts'

describe('createMeshBuilder（共享网格构建器）', () => {
    it('几何工厂返回对应类型的几何', () => {
        const b = createMeshBuilder()
        expect(b.box(1, 1, 1)).toBeInstanceOf(BoxGeometry)
        expect(b.cylinder(0.1, 0.1, 1)).toBeInstanceOf(CylinderGeometry)
        expect(b.sphere(0.1)).toBeInstanceOf(SphereGeometry)
        expect(b.cone(0.1, 1)).toBeInstanceOf(ConeGeometry)
        b.dispose()
    })

    it('add 组装网格并设置位置 / 旋转 / 阴影，且挂到 group', () => {
        const b = createMeshBuilder()
        const mesh = b.add(b.box(1, 1, 1), b.material(0xff0000), 1, 2, 3, 0.1, 0.2, 0.3)
        expect(mesh).toBeInstanceOf(Mesh)
        expect(mesh.position.toArray()).toEqual([1, 2, 3])
        expect(mesh.rotation.x).toBeCloseTo(0.1)
        expect(mesh.rotation.y).toBeCloseTo(0.2)
        expect(mesh.rotation.z).toBeCloseTo(0.3)
        expect(mesh.castShadow).toBe(true)
        expect(b.group.children).toContain(mesh)
        b.dispose()
    })

    it('faceBox 生成六面材质的方块部件并挂到 group', () => {
        const b = createMeshBuilder()
        const mesh = b.faceBox(0.5, 0.5, 0.5, 0x00ff00, 0, 0, 0)
        expect(mesh).toBeInstanceOf(Mesh)
        expect(Array.isArray(mesh.material)).toBe(true)
        if (!Array.isArray(mesh.material)) throw new Error('faceBox 应为多材质')
        expect(mesh.material).toHaveLength(6)
        expect(mesh.material[0]).toBeInstanceOf(MeshStandardMaterial)
        expect(b.group.children).toContain(mesh)
        b.dispose()
    })

    it('dispose 清空 group 且可重复调用', () => {
        const b = createMeshBuilder()
        b.add(b.box(1, 1, 1), b.material(0x000000), 0, 0, 0)
        b.faceBox(0.2, 0.2, 0.2, 0x000000, 0, 0, 0)
        expect(b.group.children.length).toBeGreaterThan(0)
        b.dispose()
        expect(b.group.children).toHaveLength(0)
        expect(() => b.dispose()).not.toThrow()
    })

    it('trackMaterial / trackTexture 登记外部资源，dispose 时一并释放', () => {
        const b = createMeshBuilder()
        const material = new MeshStandardMaterial({color: 0xffffff})
        const texture = new CanvasTexture(document.createElement('canvas'))
        b.trackMaterial(material)
        b.trackTexture(texture)
        const materialDispose = vi.spyOn(material, 'dispose')
        const textureDispose = vi.spyOn(texture, 'dispose')
        b.dispose()
        expect(materialDispose).toHaveBeenCalledTimes(1)
        expect(textureDispose).toHaveBeenCalledTimes(1)
    })

    it('每个构建器实例独立（无模块级共享状态）', () => {
        const a = createMeshBuilder()
        const c = createMeshBuilder()
        a.add(a.box(1, 1, 1), a.material(0), 0, 0, 0)
        expect(a.group.children).toHaveLength(1)
        expect(c.group.children).toHaveLength(0)
        a.dispose()
        c.dispose()
    })
})
