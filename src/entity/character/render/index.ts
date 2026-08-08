import {BoxGeometry, Mesh, MeshStandardMaterial} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'

/** 创建碰撞体可视化盒子（edit 模式显示，play 模式隐藏） */
export const createCharacterMesh = (config: CharacterConfig): Mesh => {
    const w = CHARACTER_BASE_SIZE.width * config.scale
    const h = CHARACTER_BASE_SIZE.height * config.scale
    const d = CHARACTER_BASE_SIZE.depth * config.scale
    const geom = new BoxGeometry(w, h, d)
    const mat = new MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
    })
    const mesh = new Mesh(geom, mat)
    mesh.castShadow = false
    return mesh
}

/** 更新碰撞体可视化盒子尺寸（scale 变更后调用） */
export const updateCharacterMesh = (mesh: Mesh, scale: number): void => {
    mesh.geometry.dispose()
    mesh.geometry = new BoxGeometry(
        CHARACTER_BASE_SIZE.width * scale,
        CHARACTER_BASE_SIZE.height * scale,
        CHARACTER_BASE_SIZE.depth * scale,
    )
}
