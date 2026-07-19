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
