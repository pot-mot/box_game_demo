import {CapsuleGeometry, Mesh, MeshStandardMaterial} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'

/** 创建碰撞体可视化胶囊（edit 模式显示，play 模式隐藏） */
export const createCharacterMesh = (config: CharacterConfig): Mesh => {
    const geom = new CapsuleGeometry(config.radius, config.height - config.radius * 2, 8, 12)
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
