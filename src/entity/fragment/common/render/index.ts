import {
    BufferGeometry,
    BufferAttribute,
    MeshBasicMaterial,
    Mesh,
    LineBasicMaterial,
    LineSegments,
} from 'three'
import type {FragmentData} from '../../../destroyed/types'
import type {Fragment} from '../types'
import {gridTexture} from '../../../../render/texture.ts'
import {FRAGMENT_EDGE_COLOR} from './constants.ts'

export const createFragmentMesh = (data: FragmentData): Mesh => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(data.renderVertices, 3))
    geo.setIndex(data.renderIndices)
    geo.computeVertexNormals()

    const {renderVertices, renderIndices, centroid, boxSize} = data
    const vertexCount = renderVertices.length / 3

    const votes: number[][] = Array.from({length: vertexCount}, () => [0, 0, 0])

    for (let i = 0; i < renderIndices.length; i += 3) {
        const ia = renderIndices[i], ib = renderIndices[i + 1], ic = renderIndices[i + 2]
        const ax = renderVertices[ia * 3], ay = renderVertices[ia * 3 + 1], az = renderVertices[ia * 3 + 2]
        const bx = renderVertices[ib * 3], by = renderVertices[ib * 3 + 1], bz = renderVertices[ib * 3 + 2]
        const cx = renderVertices[ic * 3], cy = renderVertices[ic * 3 + 1], cz = renderVertices[ic * 3 + 2]

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
        let nx = e1y * e2z - e1z * e2y
        let ny = e1z * e2x - e1x * e2z
        let nz = e1x * e2y - e1y * e2x
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (len > 0) { nx /= len; ny /= len; nz /= len }

        const absX = Math.abs(nx), absY = Math.abs(ny), absZ = Math.abs(nz)
        const axis = absX >= absY && absX >= absZ ? 0 : absY >= absX && absY >= absZ ? 1 : 2
        votes[ia][axis]++
        votes[ib][axis]++
        votes[ic][axis]++
    }

    const uvs = new Float32Array(vertexCount * 2)
    const [bw, bh, bd] = boxSize
    const hw = bw / 2, hh = bh / 2, hd = bd / 2

    for (let i = 0; i < vertexCount; i++) {
        const lx = renderVertices[i * 3] + centroid[0]
        const ly = renderVertices[i * 3 + 1] + centroid[1]
        const lz = renderVertices[i * 3 + 2] + centroid[2]

        const v = votes[i]
        const axis = v[0] >= v[1] && v[0] >= v[2] ? 0 : v[1] >= v[0] && v[1] >= v[2] ? 1 : 2

        if (axis === 0) {
            uvs[i * 2] = (lz + hd) / bd
            uvs[i * 2 + 1] = (ly + hh) / bh
        } else if (axis === 1) {
            uvs[i * 2] = (lx + hw) / bw
            uvs[i * 2 + 1] = (lz + hd) / bd
        } else {
            uvs[i * 2] = (lx + hw) / bw
            uvs[i * 2 + 1] = (ly + hh) / bh
        }
    }

    geo.setAttribute('uv', new BufferAttribute(uvs, 2))
    return new Mesh(geo, new MeshBasicMaterial({map: gridTexture()}))
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
    return new LineSegments(geo, new LineBasicMaterial({color: FRAGMENT_EDGE_COLOR}))
}

export const createFragmentFromData = (data: FragmentData): {mesh: Mesh; edges: LineSegments} => {
    const mesh = createFragmentMesh(data)
    const edges = createFragmentEdges(data)
    mesh.add(edges)
    return {mesh, edges}
}

export const syncFragmentToMesh = (fragment: Fragment): void => {
    fragment.mesh.position.set(fragment.body.position.x, fragment.body.position.y, fragment.body.position.z)
    fragment.mesh.quaternion.set(fragment.body.quaternion.x, fragment.body.quaternion.y, fragment.body.quaternion.z, fragment.body.quaternion.w)
}
