import {type Scene} from 'three'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics/index.ts'
import sineGenerator from '../../base/generators/sine.ts'
import {createTerrainPanel} from '../../fbm/ui/index.ts'

const TYPE = 'terrain/sine' as const
const BADGE_LABEL = 'TS'
const BADGE_COLOR = '#48b'

export const setupSineTerrain = (scene: Scene, shared: SharedWorld): TerrainContext & EntityInfoSource => {
    const ctx = createTerrainContextImpl(scene, shared, {
        type: TYPE,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generator: sineGenerator,
    })
    ;(ctx as any).panel = createTerrainPanel(ctx as TerrainContext)
    return ctx as TerrainContext & EntityInfoSource
}
