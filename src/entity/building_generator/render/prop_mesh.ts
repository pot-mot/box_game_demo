import {BoxGeometry, Group, Mesh} from 'three'
import {getSurfaceMaterial, type SurfaceMaterialId} from '../../../render/materials/index.ts'
import {scaleBoxUVs} from '../../../render/texture.ts'
import {TILE_SIZE} from '../../../render/constants.ts'
import type {BuildingPropKind} from '../props/kinds.ts'

/** 道具的一个长方体部件（局部坐标，原点为道具中心） */
interface PropPart {
    readonly w: number
    readonly h: number
    readonly d: number
    readonly x: number
    readonly y: number
    readonly z: number
}

const PROP_PARTS: Record<BuildingPropKind, readonly PropPart[]> = {
    door: [
        {w: 0.78, h: 1.55, d: 0.1, x: 0, y: 0, z: 0},
        {w: 0.06, h: 1.7, d: 0.16, x: -0.42, y: 0, z: 0},
        {w: 0.06, h: 1.7, d: 0.16, x: 0.42, y: 0, z: 0},
        {w: 0.9, h: 0.1, d: 0.16, x: 0, y: 0.85, z: 0},
        {w: 0.06, h: 0.06, d: 0.14, x: 0.3, y: 0, z: 0.06},
    ],
    window: [
        {w: 0.08, h: 0.9, d: 0.16, x: -0.41, y: 0, z: 0},
        {w: 0.08, h: 0.9, d: 0.16, x: 0.41, y: 0, z: 0},
        {w: 0.9, h: 0.08, d: 0.16, x: 0, y: -0.41, z: 0},
        {w: 0.9, h: 0.08, d: 0.16, x: 0, y: 0.41, z: 0},
        {w: 0.06, h: 0.74, d: 0.1, x: 0, y: 0, z: 0},
        {w: 0.74, h: 0.06, d: 0.1, x: 0, y: 0, z: 0},
    ],
    fence: [
        {w: 0.1, h: 1.0, d: 0.1, x: -0.45, y: 0, z: 0},
        {w: 0.1, h: 1.0, d: 0.1, x: 0.45, y: 0, z: 0},
        {w: 0.9, h: 0.08, d: 0.06, x: 0, y: -0.25, z: 0},
        {w: 0.9, h: 0.08, d: 0.06, x: 0, y: 0.25, z: 0},
    ],
    lantern: [
        {w: 0.08, h: 1.0, d: 0.08, x: 0, y: -0.1, z: 0},
        {w: 0.28, h: 0.28, d: 0.28, x: 0, y: 0.5, z: 0},
        {w: 0.34, h: 0.05, d: 0.34, x: 0, y: 0.66, z: 0},
    ],
}

/** 创建道具网格（局部坐标，围绕原点；按 yawQuarter 绕 Y 旋转） */
export const createPropMesh = (
    kind: BuildingPropKind,
    material: SurfaceMaterialId,
    yawQuarter: number,
): Group => {
    const group = new Group()
    group.rotation.y = yawQuarter * Math.PI / 2
    const sharedMaterial = getSurfaceMaterial(material)
    for (const part of PROP_PARTS[kind]) {
        const geometry = new BoxGeometry(part.w, part.h, part.d)
        scaleBoxUVs(geometry, part.w, part.h, part.d, TILE_SIZE)
        const mesh = new Mesh(geometry, sharedMaterial)
        mesh.position.set(part.x, part.y, part.z)
        group.add(mesh)
    }
    return group
}

/** 释放道具网格的几何体（材质为共享单例，不释放） */
export const disposePropMesh = (group: Group): void => {
    group.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose()
    })
}
