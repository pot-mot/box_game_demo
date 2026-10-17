import {BoxGeometry, CylinderGeometry, Mesh, SphereGeometry, ShaderMaterial, type BufferGeometry, type Material} from 'three'
import type {AreaConfig, AreaShape} from '../types/index.ts'
import type {AreaMaterialId} from '../constants.ts'
import {createAreaMaterial} from './materials/index.ts'

/** 该配置是否为水体视觉（折射双 Pass 只处理水体网格） */
export const isWaterArea = (config: AreaConfig): boolean => config.material === 'water'

const createGeometry = (shape: AreaShape): BufferGeometry => {
    if (shape.kind === 'box') return new BoxGeometry(shape.width, shape.height, shape.depth)
    if (shape.kind === 'sphere') return new SphereGeometry(shape.radius, 24, 16)
    return new CylinderGeometry(shape.radius, shape.radius, shape.height, 24)
}

export const createAreaMesh = (config: AreaConfig): Mesh =>
    new Mesh(createGeometry(config.shape), createAreaMaterial(config.material, config.shape))

/** 替换几何（尺寸变化时）；水体材质同步深度归一 */
export const updateAreaGeometry = (mesh: Mesh, shape: AreaShape): void => {
    const old = mesh.geometry
    mesh.geometry = createGeometry(shape)
    old.dispose()
    const mat = mesh.material
    if (mat instanceof ShaderMaterial && mat.uniforms.uSizeY !== undefined) {
        mat.uniforms.uSizeY.value = shape.kind === 'sphere' ? shape.radius * 2 : shape.height
    }
}

/** 替换材质（视觉标识变化时） */
export const updateAreaMaterial = (mesh: Mesh, material: AreaMaterialId, shape: AreaShape): void => {
    const old = mesh.material
    mesh.material = createAreaMaterial(material, shape)
    if (Array.isArray(old)) old.forEach(m => m.dispose())
    else (old as Material).dispose()
}

export const disposeAreaMesh = (mesh: Mesh): void => {
    mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach(m => m.dispose())
    else mat.dispose()
}
