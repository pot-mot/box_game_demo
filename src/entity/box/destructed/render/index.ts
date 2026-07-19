import {BoxGeometry, MeshBasicMaterial, Mesh, LineBasicMaterial, type LineSegments} from 'three'
import type {DestructibleConfig, DestructibleBox} from '../types'
import {gridTexture} from '../../../../render/texture.ts'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR} from './constants.ts'

// ── 网格 ──

export const createDestructibleBoxMesh = (config: DestructibleConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mesh = new Mesh(geo, new MeshBasicMaterial({map: gridTexture()}))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

// ── 尺寸更新 ──

export const updateDestructibleBoxMeshSize = (pb: DestructibleBox, config: DestructibleConfig): void => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}
