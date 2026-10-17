import {
    BoxGeometry, MeshStandardMaterial, Mesh, LineBasicMaterial, LineSegments,
    Points, PointsMaterial, BufferGeometry, Float32BufferAttribute,
    AdditiveBlending,
} from 'three'
import type {BoxConfig, Box, ParticleData} from '../types'
import {makeEdgeLines} from '../base/render'
import {scaleBoxUVs} from '../../../render/texture.ts'
import type {SurfaceMaterialId} from '../../../render/materials/ids.ts'
import {TILE_SIZE} from '../../../render/constants.ts'
import {createSurfaceGridMaterial, updateSurfaceMap, updateSurfaceBurn, SURFACE_EDGE_COLOR} from '../../../render/surfaceMaterial.ts'
import {
    MAX_PARTICLES, PARTICLE_SPAWN_RATE, PARTICLE_LIFETIME,
    PARTICLE_SPEED, PARTICLE_SIZE_BASE, PARTICLE_SIZE_MAX,
} from './constants.ts'

// ── 材质 ──
// 表面材质（MeshStandardMaterial，与建筑同一光照管线）见 `render/surfaceMaterial.ts`，与碎片共用。

const createBoxMaterial = (material: SurfaceMaterialId): MeshStandardMaterial =>
    createSurfaceGridMaterial(material)

// ── 网格 ──

export const createBoxMesh = (config: BoxConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    scaleBoxUVs(geo, config.width, config.height, config.depth, TILE_SIZE)
    const mesh = new Mesh(geo, createBoxMaterial(config.material))
    const edges = makeEdgeLines(geo, SURFACE_EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

/** 重建几何体（尺寸 / 形变量变化时）；`def` 为弹性形变偏移，缺省 0 */
export const updateBoxMeshSize = (box: Box, config: BoxConfig, def?: [number, number, number]): void => {
    const w = Math.max(0.01, config.width + (def?.[0] ?? 0))
    const h = Math.max(0.01, config.height + (def?.[1] ?? 0))
    const d = Math.max(0.01, config.depth + (def?.[2] ?? 0))
    const geo = new BoxGeometry(w, h, d)
    scaleBoxUVs(geo, w, h, d, TILE_SIZE)
    box.mesh.geometry.dispose()
    box.mesh.geometry = geo
    box.mesh.remove(box.edges)
    box.edges.geometry.dispose()
    ;(box.edges.material as LineBasicMaterial).dispose()
    box.edges = makeEdgeLines(geo, SURFACE_EDGE_COLOR)
    box.mesh.add(box.edges)
}

/** 切换表面材质（仅更新采样纹理，不重建几何体） */
export const updateBoxMaterial = (box: Box, material: SurfaceMaterialId): void => {
    updateSurfaceMap(box.mesh.material as MeshStandardMaterial, material)
}

export const disposeBoxMesh = (box: Box): void => {
    box.mesh.geometry.dispose()
    ;(box.mesh.material as MeshStandardMaterial).dispose()
    box.mesh.remove(box.edges)
    box.edges.geometry.dispose()
    ;(box.edges.material as LineBasicMaterial).dispose()
}

// ── 燃烧粒子系统 ──

export const createParticleData = (): ParticleData => ({
    pos: new Float32Array(MAX_PARTICLES * 3),
    vel: new Float32Array(MAX_PARTICLES * 3),
    color: new Float32Array(MAX_PARTICLES * 3),
    size: new Float32Array(MAX_PARTICLES),
    age: new Float32Array(MAX_PARTICLES),
    lifetime: new Float32Array(MAX_PARTICLES),
    active: new Uint8Array(MAX_PARTICLES),
})

export const createParticlePoints = (): Points => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    geo.setAttribute('size', new Float32BufferAttribute(new Float32Array(MAX_PARTICLES), 1))

    const mat = new PointsMaterial({
        size: PARTICLE_SIZE_BASE,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    })

    return new Points(geo, mat)
}

const spawnParticle = (
    data: ParticleData,
    index: number,
    boxSize: {width: number; height: number; depth: number},
    burnProgress: number,
): void => {
    const i3 = index * 3
    const face = Math.floor(Math.random() * 6)
    const rx = (Math.random() - 0.5) * boxSize.width
    const ry = (Math.random() - 0.5) * boxSize.height
    const rz = (Math.random() - 0.5) * boxSize.depth

    const hw = boxSize.width / 2
    const hh = boxSize.height / 2
    const hd = boxSize.depth / 2

    switch (face) {
        case 0: data.pos[i3] = hw; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = rz; break
        case 1: data.pos[i3] = -hw; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = rz; break
        case 2: data.pos[i3] = rx; data.pos[i3 + 1] = hh; data.pos[i3 + 2] = rz; break
        case 3: data.pos[i3] = rx; data.pos[i3 + 1] = -hh; data.pos[i3 + 2] = rz; break
        case 4: data.pos[i3] = rx; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = hd; break
        case 5: data.pos[i3] = rx; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = -hd; break
    }

    const speed = PARTICLE_SPEED * (0.5 + burnProgress * 0.5)
    data.vel[i3] = (Math.random() - 0.5) * speed * 0.6
    data.vel[i3 + 1] = speed * (0.8 + Math.random() * 0.4)
    data.vel[i3 + 2] = (Math.random() - 0.5) * speed * 0.6

    const p = burnProgress
    if (p < 0.5) {
        const t = p * 2
        data.color[i3] = 1.0
        data.color[i3 + 1] = 1.0 - t * 0.4
        data.color[i3 + 2] = 1.0 - t * 0.8
    } else {
        const t = (p - 0.5) * 2
        data.color[i3] = 1.0 - t * 0.3
        data.color[i3 + 1] = 0.6 - t * 0.5
        data.color[i3 + 2] = 0.0
    }

    data.size[index] = PARTICLE_SIZE_BASE * (0.5 + Math.random())
    data.age[index] = 0
    data.lifetime[index] = PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5)
    data.active[index] = 1
}

export const updateParticles = (
    data: ParticleData,
    points: Points,
    dt: number,
    boxSize: {width: number; height: number; depth: number},
    burnProgress: number,
): void => {
    const shrinkFactor = burnProgress > 0.8
        ? 1.0 - 0.8 * (burnProgress - 0.8) / 0.2
        : 1.0

    const posAttr = points.geometry.attributes.position as Float32BufferAttribute
    const colAttr = points.geometry.attributes.color as Float32BufferAttribute
    const sizeAttr = points.geometry.attributes.size as Float32BufferAttribute

    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (!data.active[i]) continue
        const i3 = i * 3
        data.age[i] += dt
        if (data.age[i] >= data.lifetime[i]) {
            data.active[i] = 0
            posAttr.array[i3] = 0
            posAttr.array[i3 + 1] = 0
            posAttr.array[i3 + 2] = 0
            continue
        }

        const lifeRatio = data.age[i] / data.lifetime[i]

        data.pos[i3] += data.vel[i3] * dt
        data.pos[i3 + 1] += data.vel[i3 + 1] * dt
        data.pos[i3 + 2] += data.vel[i3 + 2] * dt

        data.vel[i3 + 1] += 1.5 * dt
        data.vel[i3] *= 0.98
        data.vel[i3 + 2] *= 0.98

        const sizeScale = lifeRatio < 0.3 ? lifeRatio / 0.3 : 1.0 - (lifeRatio - 0.3) / 0.7
        data.size[i] = PARTICLE_SIZE_BASE + (PARTICLE_SIZE_MAX - PARTICLE_SIZE_BASE) * sizeScale

        const fadeOut = 1.0 - lifeRatio * lifeRatio
        data.color[i3] *= fadeOut
        data.color[i3 + 1] *= fadeOut * 0.8
        data.color[i3 + 2] *= fadeOut * 0.3

        data.color[i3] = Math.max(0, data.color[i3])
        data.color[i3 + 1] = Math.max(0, data.color[i3 + 1])
        data.color[i3 + 2] = Math.max(0, data.color[i3 + 2])

        posAttr.array[i3] = data.pos[i3]
        posAttr.array[i3 + 1] = data.pos[i3 + 1]
        posAttr.array[i3 + 2] = data.pos[i3 + 2]
        colAttr.array[i3] = data.color[i3]
        colAttr.array[i3 + 1] = data.color[i3 + 1]
        colAttr.array[i3 + 2] = data.color[i3 + 2]
        sizeAttr.array[i] = data.size[i]
    }

    ;(points.material as PointsMaterial).size = PARTICLE_SIZE_BASE * shrinkFactor

    const spawnCount = Math.floor(PARTICLE_SPAWN_RATE * (0.5 + burnProgress * 1.5) * shrinkFactor)
    let spawned = 0
    for (let i = 0; i < MAX_PARTICLES && spawned < spawnCount; i++) {
        if (!data.active[i]) {
            spawnParticle(data, i, boxSize, burnProgress)
            spawned++
        }
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
}

export const disposeParticlePoints = (points: Points): void => {
    points.geometry.dispose()
    ;(points.material as PointsMaterial).dispose()
}

/** 更新箱子燃烧进度与时间（注入着色器的 uniform） */
export const updateBurnUniform = (box: Box, burnProgress: number, dt: number): void => {
    updateSurfaceBurn(box.mesh.material as MeshStandardMaterial, burnProgress, dt)
}
