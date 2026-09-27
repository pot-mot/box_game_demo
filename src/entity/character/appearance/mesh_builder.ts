import {
    BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial,
    SphereGeometry, type BufferGeometry,
} from 'three'
import {createTwoFaceBoxPart} from '../../../render/box_parts.ts'

/**
 * 程序化网格构建器：统一登记几何 / 材质 / 网格的生命周期，消除各模型重复的样板代码。
 * 由 `weapon_mesh`（武器）与 `armor_mesh`（护甲）共用——每个模型以独立 `gen` 构造函数
 * 通过 builder 拼装部件，最终 `group` 即模型根节点，`dispose` 集中释放全部资源。
 *
 * 约定：所有可见部件都必须经 `add` / `faceBox` 挂到 `group`，才能在 `dispose` 时释放。
 */
export interface MeshBuilder {
    /** 模型根 Group：收拢全部可见部件与隐藏标记 */
    readonly group: Group
    /** 创建并登记标准材质（单色，金属/布料质感由粗糙度 / 金属度表达） */
    readonly material: (color: number, roughness?: number, metalness?: number) => MeshStandardMaterial
    /** 创建并登记盒几何 */
    readonly box: (w: number, h: number, d: number) => BoxGeometry
    /** 创建并登记圆柱 / 圆锥台几何 */
    readonly cylinder: (rTop: number, rBottom: number, height: number, segments?: number) => CylinderGeometry
    /** 创建并登记球几何 */
    readonly sphere: (radius: number, widthSegments?: number, heightSegments?: number) => SphereGeometry
    /** 创建并登记圆锥几何 */
    readonly cone: (radius: number, height: number, segments?: number) => ConeGeometry
    /** 以几何 + 材质组装网格并挂到 group，返回该网格（可继续调整 visible 等属性） */
    readonly add: (
        geometry: BufferGeometry,
        material: MeshStandardMaterial,
        x: number,
        y: number,
        z: number,
        rx?: number,
        ry?: number,
        rz?: number,
    ) => Mesh
    /** 六面明暗方块部件（与方块人身体同一风格），直接挂到 group 并登记 */
    readonly faceBox: (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => Mesh
    /** 释放全部登记的几何 / 材质并清空 group */
    readonly dispose: () => void
}

/** 创建一个构建器实例（每次构建独立，可重入，无模块级共享状态） */
export const createMeshBuilder = (): MeshBuilder => {
    const group = new Group()
    const geometries: BufferGeometry[] = []
    const materials: MeshStandardMaterial[] = []

    const material = (color: number, roughness = 0.5, metalness = 0.2): MeshStandardMaterial => {
        const m = new MeshStandardMaterial({color, roughness, metalness})
        materials.push(m)
        return m
    }

    const box = (w: number, h: number, d: number): BoxGeometry => {
        const g = new BoxGeometry(w, h, d)
        geometries.push(g)
        return g
    }

    const cylinder = (rTop: number, rBottom: number, height: number, segments = 8): CylinderGeometry => {
        const g = new CylinderGeometry(rTop, rBottom, height, segments)
        geometries.push(g)
        return g
    }

    const sphere = (radius: number, widthSegments = 8, heightSegments = 6): SphereGeometry => {
        const g = new SphereGeometry(radius, widthSegments, heightSegments)
        geometries.push(g)
        return g
    }

    const cone = (radius: number, height: number, segments = 8): ConeGeometry => {
        const g = new ConeGeometry(radius, height, segments)
        geometries.push(g)
        return g
    }

    const add = (
        geometry: BufferGeometry,
        material: MeshStandardMaterial,
        x: number,
        y: number,
        z: number,
        rx = 0,
        ry = 0,
        rz = 0,
    ): Mesh => {
        const m = new Mesh(geometry, material)
        m.position.set(x, y, z)
        m.rotation.set(rx, ry, rz)
        m.castShadow = true
        group.add(m)
        return m
    }

    const faceBox = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): Mesh => {
        const part = createTwoFaceBoxPart(w, h, d, color)
        geometries.push(part.geometry)
        for (const m of part.materials) materials.push(m)
        part.mesh.position.set(x, y, z)
        group.add(part.mesh)
        return part.mesh
    }

    const dispose = (): void => {
        group.clear()
        for (const g of geometries) g.dispose()
        for (const m of materials) m.dispose()
        geometries.length = 0
        materials.length = 0
    }

    return {group, material, box, cylinder, sphere, cone, add, faceBox, dispose}
}
