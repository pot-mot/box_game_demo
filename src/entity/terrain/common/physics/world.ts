import {type Scene} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics'
import fbmNoiseGenerator from '../../base/generators/fbm_noise.ts'
import flatGenerator from '../../base/generators/flat.ts'
import sineGenerator from '../../base/generators/sine.ts'
import stepsGenerator from '../../base/generators/steps.ts'
import {createTerrainPanel} from '../../base/ui/panel.ts'
import type {StringLocaleKey} from '../../../../i18n/index.ts'

const TYPE = 'terrain' as const
const BADGE_LABEL = 'TR'
const BADGE_COLOR = '#684'

export const GENERATORS = {
    fbm: fbmNoiseGenerator,
    flat: flatGenerator,
    sine: sineGenerator,
    steps: stepsGenerator,
} as const

export const GENERATOR_OPTIONS: {id: string; labelKey: StringLocaleKey}[] = [
    {id: 'fbm', labelKey: 'terrain_gen.fbm'},
    {id: 'flat', labelKey: 'terrain_gen.flat'},
    {id: 'sine', labelKey: 'terrain_gen.sine'},
    {id: 'steps', labelKey: 'terrain_gen.steps'},
]

export const setupTerrain = (
    scene: Scene,
    shared: SharedWorld,
    getDynamicBodies: () => readonly RAPIER.RigidBody[],
): TerrainContext & EntityInfoSource => {
    const ctxWithoutPanel = createTerrainContextImpl(scene, shared, {
        type: TYPE,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generators: GENERATORS,
        getDynamicBodies,
    })
    return {
        ...ctxWithoutPanel,
        panel: createTerrainPanel(ctxWithoutPanel, GENERATOR_OPTIONS),
    }
}
