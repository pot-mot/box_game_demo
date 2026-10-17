import {
    BufferGeometry,
    BufferAttribute,
    Mesh,
    MeshStandardMaterial,
    LineBasicMaterial,
    LineSegments,
} from 'three'
import type {FragmentData} from '../../../destroyed/types'
import type {SurfaceMaterialId} from '../../../../render/materials/ids.ts'
import type {Fragment} from '../types'
import {TILE_SIZE} from '../../../../render/constants.ts'
import {createSurfaceGridMaterial, updateSurfaceMap, SURFACE_EDGE_COLOR} from '../../../../render/surfaceMaterial.ts'

/**
 * 轴对齐判定阈值：箱子各面法线为精确 ±1，Voronoi 裂面为任意方向。
 * 低于该阈值（基本与某坐标轴平行）的三角面沿用箱子 UV 约定，保证与原箱子表面完全对齐。
 */
const AXIS_ALIGNED_EPS = 1e-3

/**
 * 逐三角面生成碎片 UV（几何已 `toNonIndexed`，每个三角面独占 3 个顶点）：
 * - 与原箱子表面共面的三角面（轴对齐）：使用与 `scaleBoxUVs` 完全一致的逐面 UV 约定，
 *   因此碎片上残留的箱子表面纹理 / 网格与裂开前逐像素对齐。
 * - 倾斜裂面：在该三角面自身平面上建立正交基做等距投影（不按坐标轴压扁），
 *   避免斜面纹理被拉伸 / 涂抹。
 *
 * 逐面而非逐顶点判定：顶点法线会被相邻的不同朝向面污染，导致箱面与裂面交界处的
 * 纹理轴向判断错误并产生拉伸，故必须按三角面独立计算。
 */
const buildFragmentFaceUVs = (data: FragmentData, positions: ArrayLike<number>): Float32Array => {
    const {centroid, boxSize} = data
    const [bw, bh, bd] = boxSize
    const hw = bw / 2, hh = bh / 2, hd = bd / 2
    const vertexCount = positions.length / 3
    const uvs = new Float32Array(vertexCount * 2)

    for (let t = 0; t < vertexCount; t += 3) {
        const i0 = t * 3, i1 = (t + 1) * 3, i2 = (t + 2) * 3
        const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2]
        const bx = positions[i1], by = positions[i1 + 1], bz = positions[i1 + 2]
        const cx = positions[i2], cy = positions[i2 + 1], cz = positions[i2 + 2]

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
        let nx = e1y * e2z - e1z * e2y
        let ny = e1z * e2x - e1x * e2z
        let nz = e1x * e2y - e1y * e2x
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (nlen > 0) { nx /= nlen; ny /= nlen; nz /= nlen }

        const absX = Math.abs(nx), absY = Math.abs(ny), absZ = Math.abs(nz)
        const axis = absX >= absY && absX >= absZ ? 0 : absY >= absZ ? 1 : 2
        const offAxisMax = axis === 0
            ? Math.max(absY, absZ)
            : axis === 1 ? Math.max(absX, absZ) : Math.max(absX, absY)
        const axisAligned = offAxisMax < AXIS_ALIGNED_EPS

        /* 倾斜裂面：t 为平面内一条参考切线（仅依赖法线，共面三角面基一致）；b = n × t */
        let tx = 0, ty = 0, tz = 0
        let btx = 0, bty = 0, btz = 0
        if (!axisAligned) {
            const refX = absY < 0.9 ? 0 : 1
            const refY = absY < 0.9 ? 1 : 0
            tx = refY * nz
            ty = -refX * nz
            tz = refX * ny - refY * nx
            const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz)
            if (tlen > 0) { tx /= tlen; ty /= tlen; tz /= tlen }
            btx = ny * tz - nz * ty
            bty = nz * tx - nx * tz
            btz = nx * ty - ny * tx
        }

        for (let k = 0; k < 3; k++) {
            const vi = t + k
            /* 箱子局部坐标 = 质心相对坐标 + 质心（与构建碎片时的放置一致） */
            const px = positions[vi * 3] + centroid[0]
            const py = positions[vi * 3 + 1] + centroid[1]
            const pz = positions[vi * 3 + 2] + centroid[2]

            if (axisAligned) {
                if (axis === 0) {
                    /* ±X 面：u 沿 z（+X 反向），v 沿 y（反向，见 scaleBoxUVs） */
                    uvs[vi * 2] = (nx >= 0 ? hd - pz : pz + hd) / TILE_SIZE
                    uvs[vi * 2 + 1] = (hh + py) / TILE_SIZE
                } else if (axis === 1) {
                    /* ±Y 面：u 沿 x，v 沿 z（+Y 反向） */
                    uvs[vi * 2] = (px + hw) / TILE_SIZE
                    uvs[vi * 2 + 1] = (ny >= 0 ? hd - pz : pz + hd) / TILE_SIZE
                } else {
                    /* ±Z 面：u 沿 x（+Z 反向），v 沿 y（反向） */
                    uvs[vi * 2] = (nz >= 0 ? px + hw : hw - px) / TILE_SIZE
                    uvs[vi * 2 + 1] = (hh + py) / TILE_SIZE
                }
            } else {
                uvs[vi * 2] = (px * tx + py * ty + pz * tz) / TILE_SIZE
                uvs[vi * 2 + 1] = (px * btx + py * bty + pz * btz) / TILE_SIZE
            }
        }
    }

    return uvs
}

export const createFragmentMesh = (data: FragmentData, material: SurfaceMaterialId): Mesh => {
    const indexed = new BufferGeometry()
    indexed.setAttribute('position', new BufferAttribute(data.renderVertices, 3))
    indexed.setIndex(data.renderIndices)
    /* 展开为非索引几何：每个三角面独立顶点，才能逐面指定 UV（相邻面不再共享顶点） */
    const geo = indexed.toNonIndexed()
    indexed.dispose()
    geo.computeVertexNormals()
    geo.setAttribute('uv', new BufferAttribute(buildFragmentFaceUVs(data, geo.getAttribute('position').array), 2))
    /* 凸包碎片用平面着色：与箱子一致的面法线受光，避免平滑法线显得发圆 */
    return new Mesh(geo, createSurfaceGridMaterial(material, {flatShading: true}))
}

/** 切换碎片表面材质（仅更新采样纹理，不重建几何体） */
export const updateFragmentMaterial = (fragment: Fragment, material: SurfaceMaterialId): void => {
    updateSurfaceMap(fragment.mesh.material as MeshStandardMaterial, material)
}

export const createFragmentEdges = (data: FragmentData): LineSegments => {
    const edgeSet = new Set<string>()
    const edgePts: number[] = []
    for (const face of data.hullFaces) {
        for (let i = 0; i < face.length; i++) {
            const a = face[i], b = face[(i + 1) % face.length]
            const key = a < b ? `${a},${b}` : `${b},${a}`
            if (!edgeSet.has(key)) {
                edgeSet.add(key)
                const v1 = data.hullVertices[a]
                const v2 = data.hullVertices[b]
                edgePts.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z)
            }
        }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(edgePts), 3))
    return new LineSegments(geo, new LineBasicMaterial({color: SURFACE_EDGE_COLOR}))
}

export const createFragmentFromData = (data: FragmentData, material: SurfaceMaterialId): {mesh: Mesh; edges: LineSegments} => {
    const mesh = createFragmentMesh(data, material)
    const edges = createFragmentEdges(data)
    mesh.add(edges)
    return {mesh, edges}
}

export const syncFragmentToMesh = (fragment: Fragment): void => {
    const trans = fragment.body.translation()
    fragment.mesh.position.set(trans.x, trans.y, trans.z)
    const rot = fragment.body.rotation()
    fragment.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
}
