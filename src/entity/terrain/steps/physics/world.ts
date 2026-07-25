import {type Scene} from 'three'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics/index.ts'
import stepsGenerator from '../../base/generators/steps.ts'
import {createTerrainPanel} from '../../fbm/ui/index.ts'

const TYPE = 'terrain/steps' as const
const BADGE_LABEL = 'TS'
const BADGE_COLOR = '#866'

export const setupStepsTerrain = (scene: Scene, shared: SharedWorld): TerrainContext & EntityInfoSource => {
    const ctx = createTerrainContextImpl(scene, shared, {
        type: TYPE,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generator: stepsGenerator,
    })
    ;(ctx as any).panel = createTerrainPanel(ctx as TerrainContext)
    return ctx as TerrainContext & EntityInfoSource
}
