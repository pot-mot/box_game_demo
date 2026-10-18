import {CapsuleGeometry, Mesh, MeshStandardMaterial} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import {bodyFormOf} from '../body_form/index.ts'
import {COLLIDER_CAPSULE_CAP_SEGMENTS, COLLIDER_CAPSULE_RADIAL_SEGMENTS, COLLIDER_MESH_OPACITY} from './constants.ts'

/** 创建与物理主碰撞体参数一致的可视化胶囊（按**体形** `size` 生成，半径 = 半宽、总高 = height×scale）：
 * 原点在胶囊底部（脚底）：几何体整体上移半高，与外观模型/实体原点语义一致 */
const makeCapsuleGeometry = (config: CharacterConfig): CapsuleGeometry => {
    const size = bodyFormOf(config.bodyFormId).size
    const scale = config.scale
    const radius = (size.width * scale) / 2
    /* CapsuleGeometry 的 length 是中间圆柱段高度（非负） */
    const length = Math.max(0.001, size.height * scale - radius * 2)
    const geom = new CapsuleGeometry(radius, length, COLLIDER_CAPSULE_CAP_SEGMENTS, COLLIDER_CAPSULE_RADIAL_SEGMENTS)
    geom.translate(0, (size.height * scale) / 2, 0)
    return geom
}

/** 创建碰撞体可视化胶囊（edit 模式显示，play 模式隐藏） */
export const createCharacterMesh = (config: CharacterConfig): Mesh => {
    const geom = makeCapsuleGeometry(config)
    const mat = new MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: COLLIDER_MESH_OPACITY,
        /* 纯叠加调试层：不写深度。否则会挡住透明地面网格条纹
         * （无限网格 depthWrite: false 且在胶囊之后绘制，条纹会被胶囊深度剔除）；
         * 角色/箱体等不透明几何仍在胶囊之前绘制、照常遮挡它 */
        depthWrite: false,
    })
    const mesh = new Mesh(geom, mat)
    mesh.castShadow = false
    return mesh
}

/** 更新碰撞体可视化胶囊尺寸（scale / 体形变更后调用） */
export const updateCharacterMesh = (mesh: Mesh, config: CharacterConfig): void => {
    mesh.geometry.dispose()
    mesh.geometry = makeCapsuleGeometry(config)
}
