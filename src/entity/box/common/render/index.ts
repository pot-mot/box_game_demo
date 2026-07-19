import {BoxGeometry, BufferGeometry, MeshBasicMaterial, Mesh, LineBasicMaterial, type LineSegments} from 'three'
import type {CommonBoxConfig, CommonBox} from '../types'
import {gridTexture} from '../../../../render/texture.ts'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR, SELECTED_EDGE_COLOR} from './constants.ts'

export const createCommonBoxMesh = (config: CommonBoxConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mesh = new Mesh(geo, new MeshBasicMaterial({map: gridTexture()}))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export const updateCommonBoxMeshSize = (pb: CommonBox, config: CommonBoxConfig): void => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}

export const disposeCommonBoxMesh = (pb: CommonBox): void => {
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
