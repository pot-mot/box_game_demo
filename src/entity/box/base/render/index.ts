import type {BufferGeometry, Mesh} from 'three'
import {EdgesGeometry, LineBasicMaterial, LineSegments} from 'three'

// ── 边缘线 ──

export const makeEdgeLines = (geo: BufferGeometry, color: number): LineSegments => {
    const e = new EdgesGeometry(geo)
    return new LineSegments(e, new LineBasicMaterial({color}))
}

// ── 选中线框 ──

export const SELECTED_EDGE_COLOR = 0x00ffcc

export const createWireframe = (geo: BufferGeometry): LineSegments =>
    makeEdgeLines(geo, SELECTED_EDGE_COLOR)

export const disposeWireframe = (wireframe: LineSegments): void => {
    wireframe.geometry.dispose()
    ;(wireframe.material as LineBasicMaterial).dispose()
}

export const cleanupWireframe = <T extends { mesh: Mesh; wireframe: LineSegments | undefined }>(entity: T): void => {
    if (entity.wireframe) {
        entity.mesh.remove(entity.wireframe)
        disposeWireframe(entity.wireframe)
        entity.wireframe = undefined
    }
}
