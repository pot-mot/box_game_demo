import {type Scene} from 'three'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityInfoSource} from '../../../box/base/types/entity_info.ts'
import type {TerrainContext} from '../../base/types'
import {createTerrainContextImpl} from '../../base/physics/index.ts'
import flatGenerator from '../../base/generators/flat.ts'
import {createTerrainPanel} from '../../fbm/ui/index.ts'

const TYPE = 'terrain/flat' as const
const BADGE_LABEL = 'Tf'
const BADGE_COLOR = '#686'

export const setupFlatTerrain = (scene: Scene, shared: SharedWorld): TerrainContext & EntityInfoSource => {
    const ctx = createTerrainContextImpl(scene, shared, {
        type: TYPE,
        badgeLabel: BADGE_LABEL,
        badgeColor: BADGE_COLOR,
        generator: flatGenerator,
    })
    ;(ctx as any).panel = createTerrainPanel(ctx as TerrainContext)
    return ctx as TerrainContext & EntityInfoSource
}
