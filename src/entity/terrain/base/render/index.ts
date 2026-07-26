import {BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, LineBasicMaterial, LineSegments} from 'three'
import {createGridTerrainMaterial} from '../../../../render/gridMaterial.ts'
import {DEFAULT_BASE_COLOR, DEFAULT_GRID_COLOR, TILE_SIZE} from '../../../../render/constants.ts'
import type {BaseTerrainConfig} from '../types'
import {TERRAIN_EDGE_COLOR} from '../../constants.ts'

export const createTerrainMesh = (heights: number[][], config: BaseTerrainConfig): { mesh: Mesh; edges: LineSegments } => {
    const gs = config.gridSize
    const cs = config.cellSize
    const worldSize = (gs - 1) * cs
    const half = worldSize / 2
    const range = config.maxHeight - config.minHeight

    const positions: number[] = []
    const uvs: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    for (let x = 0; x < gs; x++) {
        for (let z = 0; z < gs; z++) {
            const px = x * cs - half
            const pz = z * cs - half
            const py = heights[x][z]
            positions.push(px, py, pz)
            uvs.push(x * cs / TILE_SIZE, z * cs / TILE_SIZE)

            const t = range > 0 ? (py - config.minHeight) / range : 0.5
            const cr = Math.round(lerp(139, 100, t))
            const cg = Math.round(lerp(115, 180, t))
            const cb = Math.round(lerp(85, 120, t))
            colors.push(cr / 255, cg / 255, cb / 255)
        }
    }

    for (let x = 0; x < gs - 1; x++) {
        for (let z = 0; z < gs - 1; z++) {
            const i = x * gs + z
            indices.push(i, i + 1, i + gs)
            indices.push(i + 1, i + gs + 1, i + gs)
        }
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mesh = new Mesh(geo, createGridTerrainMaterial(DEFAULT_BASE_COLOR, DEFAULT_GRID_COLOR))

    const edgeIndices: number[] = []
    for (let x = 0; x < gs; x += 4) {
        for (let z = 0; z < gs - 1; z++) {
            const i = x * gs + z
            edgeIndices.push(i, i + 1)
        }
    }
    for (let z = 0; z < gs; z += 4) {
        for (let x = 0; x < gs - 1; x++) {
            const i = x * gs + z
            edgeIndices.push(i, i + gs)
        }
    }

    const edgeGeo = new BufferGeometry()
    const edgePos: number[] = []
    const posAttr = geo.getAttribute('position')
    for (const idx of edgeIndices) {
        edgePos.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx))
    }
    edgeGeo.setAttribute('position', new Float32BufferAttribute(edgePos, 3))
    const edges = new LineSegments(edgeGeo, new LineBasicMaterial({color: TERRAIN_EDGE_COLOR}))

    return {mesh, edges}
}

export const rebuildTerrainMesh = (
    old: { mesh: Mesh; edges: LineSegments },
    heights: number[][],
    config: BaseTerrainConfig,
): void => {
    const {mesh, edges} = createTerrainMesh(heights, config)
    old.mesh.geometry.dispose()
    ;(old.mesh.material as MeshBasicMaterial).dispose()
    old.mesh.geometry = mesh.geometry
    old.mesh.material = mesh.material
    old.mesh.remove(old.edges)
    old.edges.geometry.dispose()
    ;(old.edges.material as LineBasicMaterial).dispose()
    old.edges = edges
    old.mesh.add(edges)
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
