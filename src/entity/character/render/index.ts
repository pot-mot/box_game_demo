import {CapsuleGeometry, Mesh, MeshStandardMaterial} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {COLLIDER_CAPSULE_CAP_SEGMENTS, COLLIDER_CAPSULE_RADIAL_SEGMENTS, COLLIDER_MESH_OPACITY} from './constants.ts'

/** 创建与物理碰撞体参数一致的可视化胶囊：
 * 半径 = 碰撞箱半宽，总高 = 碰撞箱高（length + 2×radius = height×scale，
 * 与 spawnEntity 的 capsule(capsuleHalfHeight, capsuleRadius) 完全对应）。
 * 原点在胶囊底部（脚底）：几何体整体上移半高，与外观模型/实体原点语义一致 */
const makeCapsuleGeometry = (scale: number): CapsuleGeometry => {
    const radius = (CHARACTER_BASE_SIZE.width * scale) / 2
    /* CapsuleGeometry 的 length 是中间圆柱段高度 */
    const length = CHARACTER_BASE_SIZE.height * scale - radius * 2
    const geom = new CapsuleGeometry(radius, length, COLLIDER_CAPSULE_CAP_SEGMENTS, COLLIDER_CAPSULE_RADIAL_SEGMENTS)
    geom.translate(0, (CHARACTER_BASE_SIZE.height * scale) / 2, 0)
    return geom
}

/** 创建碰撞体可视化胶囊（edit 模式显示，play 模式隐藏） */
export const createCharacterMesh = (config: CharacterConfig): Mesh => {
    const geom = makeCapsuleGeometry(config.scale)
    const mat = new MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: COLLIDER_MESH_OPACITY,
    })
    const mesh = new Mesh(geom, mat)
    mesh.castShadow = false
    return mesh
}

/** 更新碰撞体可视化胶囊尺寸（scale 变更后调用） */
export const updateCharacterMesh = (mesh: Mesh, scale: number): void => {
    mesh.geometry.dispose()
    mesh.geometry = makeCapsuleGeometry(scale)
}
