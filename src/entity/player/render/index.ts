import {CapsuleGeometry, Mesh, MeshStandardMaterial} from 'three'
import {PLAYER_COLOR, PLAYER_EMISSIVE} from './constants.ts'
import type {PlayerConfig} from '../validation.ts'

/** 创建玩家胶囊网格 */
export const createPlayerMesh = (config: PlayerConfig): Mesh => {
    const geom = new CapsuleGeometry(config.radius, config.height - config.radius * 2, 8, 12)
    const mat = new MeshStandardMaterial({
        color: PLAYER_COLOR,
        emissive: PLAYER_EMISSIVE,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        metalness: 0.1,
    })
    const mesh = new Mesh(geom, mat)
    mesh.castShadow = true
    return mesh
}
