import {type Scene} from 'three'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics/index.ts'
import fbmNoiseGenerator from '../../base/generators/fbm_noise.ts'
import {createTerrainPanel} from '../ui/index.ts'

const TYPE = 'terrain/fbm' as const
const BADGE_LABEL = 'TF'
const BADGE_COLOR = '#684'

export const setupFbmTerrain = (scene: Scene, shared: SharedWorld): TerrainContext & EntityInfoSource => {
    const ctx = createTerrainContextImpl(scene, shared, {
        type: TYPE,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generator: fbmNoiseGenerator,
    })
    ;(ctx as any).panel = createTerrainPanel(ctx as TerrainContext)
    return ctx as TerrainContext & EntityInfoSource
}
