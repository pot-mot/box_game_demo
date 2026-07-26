import type {Mesh} from 'three'
import type {Body} from 'cannon-es'

export interface CharacterConfig {
    speed: number
    jumpHeight: number
    radius: number
    height: number
}

export interface CharacterEntity {
    id: number
    config: CharacterConfig
    mesh: Mesh
    body: Body
    rowText: string
}
