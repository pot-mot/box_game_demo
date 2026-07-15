import {
    BoxGeometry,
    type BufferGeometry,
    MeshBasicMaterial,
    Mesh,
    EdgesGeometry,
    LineBasicMaterial,
    LineSegments,
} from 'three'
import type {BoxConfig, PhysicsBox} from '../types/physics.ts'
import {gridTexture} from '../../render/texture.ts'
import {EDGE_COLOR, SELECTED_EDGE_COLOR} from './constants.ts'

const makeEdgeLines = (geo: BufferGeometry, color: number): LineSegments => {
    const e = new EdgesGeometry(geo)
    return new LineSegments(e, new LineBasicMaterial({color}))
}

export const createBoxMesh = (config: BoxConfig): { mesh: Mesh, edges: LineSegments } => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mesh = new Mesh(geo, new MeshBasicMaterial({map: gridTexture()}))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export const updateBoxMeshSize = (pb: PhysicsBox, config: BoxConfig): void => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo

    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}

export const disposeBoxMesh = (pb: PhysicsBox): void => {
    pb.mesh.geometry.dispose()
    ;(pb.mesh.material as MeshBasicMaterial).dispose()
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
}

export const createWireframe = (geo: BufferGeometry): LineSegments =>
    makeEdgeLines(geo, SELECTED_EDGE_COLOR)

export const disposeWireframe = (wireframe: LineSegments): void => {
    wireframe.geometry.dispose()
    ;(wireframe.material as LineBasicMaterial).dispose()
}

export const syncBodyToMesh = (pb: PhysicsBox): void => {
    pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
    pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
}
