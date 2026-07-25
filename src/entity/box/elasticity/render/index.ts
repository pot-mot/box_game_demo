import type {ElasticBoxConfig, ElasticBox} from '../types'
import {BoxGeometry, Mesh, MeshBasicMaterial, LineBasicMaterial, type LineSegments} from 'three'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR, BOX_COLOR} from './constants.ts'

export const createElasticBoxMesh = (config: ElasticBoxConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mesh = new Mesh(geo, new MeshBasicMaterial({color: BOX_COLOR}))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export const updateElasticBoxMeshSize = (pb: ElasticBox): void => {
    const w = Math.max(0.01, pb.config.width + pb.def[0])
    const h = Math.max(0.01, pb.config.height + pb.def[1])
    const d = Math.max(0.01, pb.config.depth + pb.def[2])
    const geo = new BoxGeometry(w, h, d)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}

export const disposeElasticBoxMesh = (pb: ElasticBox): void => {
    pb.mesh.geometry.dispose()
    ;(pb.mesh.material as MeshBasicMaterial).dispose()
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
}