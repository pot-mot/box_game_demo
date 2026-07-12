import {
    BoxGeometry,
    type BufferGeometry,
    MeshBasicMaterial,
    Mesh,
    EdgesGeometry,
    LineBasicMaterial,
    LineSegments,
    CanvasTexture,
} from 'three'
import type {BoxConfig, PhysicsBox} from '../types/physics.ts'
import {
    EDGE_COLOR, SELECTED_EDGE_COLOR,
    TEX_SIZE, TEX_DIV, TEX_FILL, TEX_GRID, TEX_ACCENT,
} from './constants.ts'

let _gridTex: CanvasTexture | null = null

export function gridTexture(): CanvasTexture {
    if (_gridTex) return _gridTex
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = TEX_FILL
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
    ctx.strokeStyle = TEX_GRID
    ctx.lineWidth = 1
    const step = TEX_SIZE / TEX_DIV
    for (let i = 0; i <= TEX_DIV; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, TEX_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(TEX_SIZE, i * step); ctx.stroke()
    }
    ctx.strokeStyle = TEX_ACCENT
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, TEX_SIZE, TEX_SIZE)
    _gridTex = new CanvasTexture(canvas)
    return _gridTex
}

function makeEdgeLines(geo: BufferGeometry, color: number): LineSegments {
    const e = new EdgesGeometry(geo)
    return new LineSegments(e, new LineBasicMaterial({color}))
}

export function createBoxMesh(config: BoxConfig): { mesh: Mesh, edges: LineSegments } {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mesh = new Mesh(geo, new MeshBasicMaterial({map: gridTexture()}))
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export function updateBoxMeshSize(pb: PhysicsBox, config: BoxConfig): void {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo

    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}

export function disposeBoxMesh(pb: PhysicsBox): void {
    pb.mesh.geometry.dispose()
    ;(pb.mesh.material as MeshBasicMaterial).dispose()
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
}

export function createWireframe(geo: BufferGeometry): LineSegments {
    return makeEdgeLines(geo, SELECTED_EDGE_COLOR)
}

export function disposeWireframe(wireframe: LineSegments): void {
    wireframe.geometry.dispose()
    ;(wireframe.material as LineBasicMaterial).dispose()
}

export function syncBodyToMesh(pb: PhysicsBox): void {
    pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
    pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
}
