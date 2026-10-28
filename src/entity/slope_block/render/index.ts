import {BufferGeometry, Float32BufferAttribute, Mesh} from 'three'
import {getSurfaceMaterial} from '../../../render/materials/index.ts'
import type {SlopeBlockConfig} from '../validation.ts'

type Vec3 = readonly [number, number, number]

interface FaceVertex {
    readonly p: Vec3
    readonly uv: readonly [number, number]
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** 生成三角柱的 5 个外表面；每个面按几何中心朝外修正绕序 */
const prismFaces = (size: number, axis: 'x' | 'z'): FaceVertex[][] => {
    const n = size
    const a: Vec3 = [0, 0, 0]
    const b: Vec3 = axis === 'x' ? [n, 0, 0] : [0, 0, n]
    const c: Vec3 = axis === 'x' ? [n, n, 0] : [0, n, n]
    const d: Vec3 = axis === 'x' ? [0, 0, n] : [n, 0, 0]
    const e: Vec3 = [b[0] + d[0], b[1] + d[1], b[2] + d[2]]
    const f: Vec3 = [c[0] + d[0], c[1] + d[1], c[2] + d[2]]
    const polygons: Vec3[][] = [
        [a, b, c],
        [d, e, f],
        [a, b, e, d],
        [b, c, f, e],
        [c, a, d, f],
    ]

    const center: Vec3 = [(a[0] + c[0] + d[0] + f[0]) / 4, (a[1] + c[1] + d[1] + f[1]) / 4, (a[2] + c[2] + d[2] + f[2]) / 4]
    const faces: FaceVertex[][] = []
    for (const polygon of polygons) {
        const faceCenter: Vec3 = [
            polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
            polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length,
            polygon.reduce((sum, p) => sum + p[2], 0) / polygon.length,
        ]
        const normal = cross(sub(polygon[1], polygon[0]), sub(polygon[2], polygon[0]))
        const ordered = dot(normal, sub(faceCenter, center)) < 0 ? [...polygon].reverse() : polygon
        const u = dist(ordered[0], ordered[1])
        const v = dist(ordered[0], ordered[ordered.length - 1])
        const uvs: Array<[number, number]> = ordered.length === 3
            ? [[0, 0], [u, 0], [0, v]]
            : [[0, 0], [u, 0], [u, v], [0, v]]
        faces.push(ordered.map((p, index) => ({p, uv: uvs[index]})))
    }
    return faces
}

export const buildSlopeBlockGeometry = (config: SlopeBlockConfig): BufferGeometry => {
    const faces = prismFaces(config.size, config.axis)
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    for (const face of faces) {
        const base = positions.length / 3
        for (const vertex of face) {
            positions.push(vertex.p[0], vertex.p[1], vertex.p[2])
            uvs.push(vertex.uv[0], vertex.uv[1])
        }
        if (face.length === 3) {
            indices.push(base, base + 1, base + 2)
        } else {
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
}

/** 与渲染几何完全一致的 trimesh 数据（非索引冗余顶点 + 顺序索引） */
export const buildSlopeBlockTrimesh = (config: SlopeBlockConfig): {vertices: Float32Array; indices: Uint32Array} => {
    const geometry = buildSlopeBlockGeometry(config)
    const position = geometry.getAttribute('position')
    const vertices = new Float32Array(position.count * 3)
    for (let i = 0; i < position.count; i++) {
        vertices[i * 3] = position.getX(i)
        vertices[i * 3 + 1] = position.getY(i)
        vertices[i * 3 + 2] = position.getZ(i)
    }
    const index = geometry.getIndex()
    const indices = index === null
        ? new Uint32Array(Array.from({length: position.count}, (_, i) => i))
        : new Uint32Array(index.array)
    geometry.dispose()
    return {vertices, indices}
}

export const createSlopeBlockMesh = (config: SlopeBlockConfig): Mesh => {
    const geometry = buildSlopeBlockGeometry(config)
    const mesh = new Mesh(geometry, getSurfaceMaterial(config.material))
    mesh.name = 'slope-block'
    return mesh
}

/** 只释放本实体几何；表面材质为共享单例 */
export const disposeSlopeBlockMesh = (mesh: Mesh): void => {
    mesh.geometry.dispose()
}
