import {BoxGeometry, MeshBasicMaterial, Mesh, LineBasicMaterial, type LineSegments} from 'three'
import type {MagnetBoxConfig, MagnetBox} from '../types'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR, BOX_COLOR} from './constants.ts'

export const createMagnetBoxMesh = (config: MagnetBoxConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mesh = new Mesh(geo, new MeshBasicMaterial({color: BOX_COLOR}))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export const updateMagnetBoxMeshSize = (pb: MagnetBox, config: MagnetBoxConfig): void => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}

export const disposeMagnetBoxMesh = (pb: MagnetBox): void => {
    pb.mesh.geometry.dispose()
    ;(pb.mesh.material as MeshBasicMaterial).dispose()
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
}
