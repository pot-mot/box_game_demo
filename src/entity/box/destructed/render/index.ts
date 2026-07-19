import {
    BoxGeometry,
    BufferGeometry,
    MeshBasicMaterial,
    Mesh,
    EdgesGeometry,
    LineBasicMaterial,
    LineSegments,
    BufferAttribute,
} from 'three'
import type {DestructibleConfig, DestructibleBox} from '../types'
import {gridTexture} from '../../../../render/texture.ts'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR, CRACK_COLOR, DEFORMATION_FACTOR} from './constants.ts'

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
    pb.vertexOffsets = undefined
    if (pb.cracks) {
        pb.mesh.remove(pb.cracks)
        pb.cracks.geometry.dispose()
        ;(pb.cracks.material as LineBasicMaterial).dispose()
        pb.cracks = undefined
    }
}

// ── 形变 ──

export const applyDeformation = (
    pb: DestructibleBox,
    contactPoint: [number, number, number],
    normal: [number, number, number],
    force: number,
): void => {
    const geo = pb.mesh.geometry as BoxGeometry
    const pos = geo.attributes.position as BufferAttribute
    const verts = pos.array as Float32Array

    if (!pb.vertexOffsets || pb.vertexOffsets.length !== verts.length) {
        pb.vertexOffsets = new Float32Array(verts.length)
    }

    const offsets = pb.vertexOffsets
    const maxDisp = DEFORMATION_FACTOR * Math.min(pb.config.width, pb.config.height, pb.config.depth) * Math.min(force, 1)

    for (let i = 0; i < verts.length; i += 3) {
        const lx = verts[i], ly = verts[i + 1], lz = verts[i + 2]
        const dx = lx - contactPoint[0], dy = ly - contactPoint[1], dz = lz - contactPoint[2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const influence = Math.max(0, 1 - dist / (pb.config.width * 0.5))
        const disp = influence * maxDisp
        offsets[i] -= normal[0] * disp
        offsets[i + 1] -= normal[1] * disp
        offsets[i + 2] -= normal[2] * disp
    }

    for (let i = 0; i < verts.length; i++) {
        verts[i] += offsets[i]
    }
    pos.needsUpdate = true

    const newEdgesGeo = new EdgesGeometry(geo)
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = new LineSegments(newEdgesGeo, new LineBasicMaterial({color: EDGE_COLOR}))
    pb.mesh.add(pb.edges)

    if (pb.cracks) {
        pb.mesh.remove(pb.cracks)
        pb.mesh.add(pb.cracks)
    }
}

// ── 裂纹渲染 ──

const generateCrackSegments = (
    contactPoint: [number, number, number],
    normal: [number, number, number],
    intensity: number,
): Float32Array => {
    const segmentsCount = Math.max(3, Math.floor(intensity * 8))
    const pts: number[] = []
    let rngSeed = (intensity * 1000) | 0
    const rand = (): number => {
        rngSeed = (rngSeed * 1664525 + 1013904223) & 0x7fffffff
        return (rngSeed >>> 0) / 0x7fffffff
    }

    const perpX = normal[1] !== 0 || normal[2] !== 0
        ? [0, -normal[2], normal[1]]
        : [normal[2], 0, -normal[0]]
    const plen = Math.sqrt(perpX[0] * perpX[0] + perpX[1] * perpX[1] + perpX[2] * perpX[2])
    if (plen > 0) { perpX[0] /= plen; perpX[1] /= plen; perpX[2] /= plen }

    const perpY = [
        normal[1] * perpX[2] - normal[2] * perpX[1],
        normal[2] * perpX[0] - normal[0] * perpX[2],
        normal[0] * perpX[1] - normal[1] * perpX[0],
    ]

    let cx = contactPoint[0], cy = contactPoint[1], cz = contactPoint[2]
    const spread = intensity * 0.5

    for (let i = 0; i < segmentsCount; i++) {
        const len = (0.2 + rand() * 0.3) * intensity
        const angle = rand() * Math.PI * 2
        const dx = (Math.cos(angle) * perpX[0] + Math.sin(angle) * perpY[0]) * len
        const dy = (Math.cos(angle) * perpX[1] + Math.sin(angle) * perpY[1]) * len
        const dz = (Math.cos(angle) * perpX[2] + Math.sin(angle) * perpY[2]) * len
        const vx = normal[0] * spread * rand()
        const vy = normal[1] * spread * rand()
        const vz = normal[2] * spread * rand()

        pts.push(cx, cy, cz, cx + dx + vx, cy + dy + vy, cz + dz + vz)
        cx += (dx + vx) * 0.3
        cy += (dy + vy) * 0.3
        cz += (dz + vz) * 0.3
    }

    return new Float32Array(pts)
}

export const applyCracks = (
    pb: DestructibleBox,
    contactPoint: [number, number, number],
    normal: [number, number, number],
    intensity: number,
): void => {
    const crackVerts = generateCrackSegments(contactPoint, normal, intensity)
    const crackGeo = new BufferGeometry()
    crackGeo.setAttribute('position', new BufferAttribute(crackVerts, 3))

    const newCracks = new LineSegments(crackGeo, new LineBasicMaterial({
        color: CRACK_COLOR,
        transparent: true,
        opacity: Math.min(1, intensity),
    }))

    if (pb.cracks) {
        pb.mesh.remove(pb.cracks)
        pb.cracks.geometry.dispose()
        ;(pb.cracks.material as LineBasicMaterial).dispose()
    }

    pb.cracks = newCracks
    pb.mesh.add(pb.cracks)
}


