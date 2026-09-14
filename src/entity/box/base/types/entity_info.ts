import type {Mesh} from 'three'
import type {EntityType} from '../../../constants'
import type {PanelContext} from '../ui'
import type {SourceEmitter} from './event_emitter'
import type {XYZ} from './index'

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
    /** 设置实体位置与旋转（度）；角色等不支持旋转的系统可忽略 rotDeg */
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
}

export type {EntityPanelInfo, EntityInfoSource}
