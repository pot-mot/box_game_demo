import type {LineSegments, Mesh} from 'three'
import type {Body} from 'cannon-es'
import type {EntityType} from '../../../constants.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'

export interface BaseTerrainConfig {
    gridSize: number
    cellSize: number
    maxHeight: number
    friction: number
    generatorId: string
}

export interface BaseTerrainEntity {
    id: number
    config: BaseTerrainConfig
    heights: number[][]
    body: Body
    mesh: Mesh
    edges: LineSegments
    wireframe: LineSegments | undefined
    rowText: string
}

export interface HeightGenerator {
    readonly id: string
    readonly label: string
    generate(gridSize: number, cellSize: number, maxHeight: number): number[][]
}

export interface TerrainSetupOptions {
    type: EntityType
    badgeLabel: string
    badgeColor: string
    generators: Record<string, HeightGenerator>
}

export interface TerrainHeightQuery {
    getHeightAt: (worldX: number, worldZ: number) => number | undefined
}

export interface TerrainContext extends EntityInfoSource, TerrainHeightQuery {
    add: (config: BaseTerrainConfig, x: number, y: number, z: number) => BaseTerrainEntity
    getSelected: () => BaseTerrainEntity | undefined
    getAll: () => BaseTerrainEntity[]
    getEntityList: () => BaseTerrainEntity[]
    sculpt: (id: number, worldX: number, worldZ: number, direction: 1 | -1) => void
    getBody: (id: number) => Body | undefined
    updateConfig: (id: number, partial: Partial<BaseTerrainConfig>) => void
    updatePosition: (id: number, x: number, z: number) => void
}
