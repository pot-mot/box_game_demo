import {CapsuleGeometry, Mesh, MeshStandardMaterial} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {AttackType} from '../../../character/archetypes.ts'
import {MELEE_COLOR, MELEE_EMISSIVE, RANGED_COLOR, RANGED_EMISSIVE} from './constants.ts'

export const createCharacterMesh = (config: CharacterConfig, attackType: AttackType): Mesh => {
    const geom = new CapsuleGeometry(config.radius, config.height - config.radius * 2, 8, 12)
    const isMelee = attackType === 'melee'
    const color = isMelee ? MELEE_COLOR : RANGED_COLOR
    const emissive = isMelee ? MELEE_EMISSIVE : RANGED_EMISSIVE

    const mat = new MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        metalness: 0.1,
    })
    const mesh = new Mesh(geom, mat)
    mesh.castShadow = true
    return mesh
}
