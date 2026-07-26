import {BoxGeometry, ShaderMaterial, Mesh, LineBasicMaterial, type LineSegments} from 'three'
import type {CommonBoxConfig, CommonBox} from '../types'
import {createGridBoxMaterial} from '../../../../render/gridMaterial.ts'
import {scaleBoxUVs} from '../../../../render/texture.ts'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR, BASE_COLOR, GRID_COLOR} from './constants.ts'
import {TILE_SIZE} from '../../../../render/constants.ts'

// ── 网格 ──

export const createCommonBoxMesh = (config: CommonBoxConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    scaleBoxUVs(geo, config.width, config.height, config.depth, TILE_SIZE)
    const mesh = new Mesh(geo, createGridBoxMaterial(BASE_COLOR, GRID_COLOR))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export const updateCommonBoxMeshSize = (pb: CommonBox, config: CommonBoxConfig): void => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    scaleBoxUVs(geo, config.width, config.height, config.depth, TILE_SIZE)
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
    ;(pb.mesh.material as ShaderMaterial).dispose()
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
}
