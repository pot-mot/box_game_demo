import type {Mesh} from 'three'
import type {EntityType} from '../../../constants'
import type {PanelContext} from '../ui'
import type {SourceEmitter} from './event_emitter'

interface EntityPanelInfo {
    id: number
    type: EntityType
    badgeLabel: string
    badgeColor: string
    rowText: string
}

interface EntityInfoSource {
    readonly type: EntityType
    readonly events: SourceEmitter
    panel: PanelContext
    readonly panelInfo: EntityPanelInfo[]
    getSelectedId: () => number | undefined
    select: (id: number | undefined) => void
    remove: (id: number) => void
    getMeshes: () => Mesh[]
    getEntityList: () => Array<{id: number; mesh: Mesh}>
    spawnAt: (x: number, y: number, z: number) => void
    syncPositions: () => void
}

export type {EntityPanelInfo, EntityInfoSource}
