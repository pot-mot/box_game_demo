import {CapsuleGeometry, Mesh, MeshStandardMaterial} from 'three'
import {CHARACTER_COLOR, CHARACTER_EMISSIVE} from './constants.ts'
import type {CharacterConfig} from '../../../character/types.ts'

export const createCharacterMesh = (config: CharacterConfig): Mesh => {
    const geom = new CapsuleGeometry(config.radius, config.height - config.radius * 2, 8, 12)
    const mat = new MeshStandardMaterial({
        color: CHARACTER_COLOR,
        emissive: CHARACTER_EMISSIVE,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        metalness: 0.1,
    })
    const mesh = new Mesh(geom, mat)
    mesh.castShadow = true
    return mesh
}
