import {type Scene} from 'three'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics'
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
    const ctxWithoutPanel = createTerrainContextImpl(scene, shared, {
        type: TYPE,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generators: GENERATORS,
    })
    return {
        ...ctxWithoutPanel,
        panel: createTerrainPanel(ctxWithoutPanel, GENERATOR_OPTIONS),
    }
}
