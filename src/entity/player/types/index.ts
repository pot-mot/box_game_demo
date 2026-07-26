import type {Mesh} from 'three'
import type {Body} from 'cannon-es'
import type {PlayerConfig} from '../validation.ts'

export type {PlayerConfig, PlayerConfigSchema} from '../validation.ts'

export interface PlayerEntity {
    id: number
    config: PlayerConfig
    mesh: Mesh
    body: Body
    rowText: string
}
