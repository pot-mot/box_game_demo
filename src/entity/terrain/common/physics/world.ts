import {type Scene} from 'three'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics/index.ts'
import fbmNoiseGenerator from '../../base/generators/fbm_noise.ts'
import flatGenerator from '../../base/generators/flat.ts'
import sineGenerator from '../../base/generators/sine.ts'
import stepsGenerator from '../../base/generators/steps.ts'
import {createTerrainPanel} from '../../base/ui/panel.ts'

const TYPE = 'terrain' as const
const BADGE_LABEL = 'TR'
const BADGE_COLOR = '#684'

export const GENERATORS = {
    fbm: fbmNoiseGenerator,
    flat: flatGenerator,
    sine: sineGenerator,
    steps: stepsGenerator,
} as const

export const GENERATOR_OPTIONS: {id: string; label: string}[] = [
    {id: 'fbm', label: 'FBM 噪声'},
    {id: 'flat', label: '平坦'},
    {id: 'sine', label: '正弦波'},
    {id: 'steps', label: '阶梯'},
]

export const setupTerrain = (scene: Scene, shared: SharedWorld): TerrainContext & EntityInfoSource => {
    const ctx = createTerrainContextImpl(scene, shared, {
        type: TYPE as unknown as any,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generators: GENERATORS as unknown as Record<string, any>,
    })
    ;(ctx as any).panel = createTerrainPanel(ctx as TerrainContext, GENERATOR_OPTIONS)
    return ctx as TerrainContext & EntityInfoSource
}
