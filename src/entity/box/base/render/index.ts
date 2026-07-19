import type {BufferGeometry} from 'three'
import {EdgesGeometry, LineBasicMaterial, LineSegments} from 'three'
import type {Body} from 'cannon-es'
import type {Mesh} from 'three'

export const makeEdgeLines = (geo: BufferGeometry, color: number): LineSegments => {
    const e = new EdgesGeometry(geo)
    return new LineSegments(e, new LineBasicMaterial({color}))
}

export const syncBodyToMesh = (mesh: Mesh, body: Body): void => {
    mesh.position.set(body.position.x, body.position.y, body.position.z)
    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
}
