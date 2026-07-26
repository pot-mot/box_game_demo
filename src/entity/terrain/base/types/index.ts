import {z} from 'zod'
import type {LineSegments, Mesh} from 'three'
import type {Body} from 'cannon-es'
import type {EntityType} from '../../../constants.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import {BaseTerrainConfigSchema} from '../validation.ts'

export type BaseTerrainConfig = z.infer<typeof BaseTerrainConfigSchema>
export {BaseTerrainConfigSchema} from '../validation.ts'

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
    generate(gridSize: number, cellSize: number, minHeight: number, maxHeight: number): number[][]
}

export interface TerrainSetupOptions {
    type: EntityType
    badgeLabel: string
    badgeColor: string
    generators: Record<string, HeightGenerator>
}

export interface TerrainHeightQuery {
    getHeightAt: (worldX: number, worldZ: number, bottomY: number) => number | undefined
}

export interface TerrainContext extends EntityInfoSource, TerrainHeightQuery {
    add: (config: BaseTerrainConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}) => BaseTerrainEntity
    getSelected: () => BaseTerrainEntity | undefined
    getAll: () => BaseTerrainEntity[]
    getEntityList: () => BaseTerrainEntity[]
    sculpt: (id: number, worldX: number, worldZ: number, direction: 1 | -1) => void
    getBody: (id: number) => Body | undefined
    updateConfig: (id: number, partial: Partial<BaseTerrainConfig>) => void
    updatePosition: (id: number, x: number, z: number) => void
    setTransform: (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}) => void
    setHeights: (id: number, heights: number[][]) => void
}
