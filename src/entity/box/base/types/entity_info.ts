import type {Mesh, Object3D} from 'three'
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
    /** 可选：按需重算行文本（用于含本地化文案的行，语言切换后下一帧即刷新）；缺省回退 `rowText` */
    rowTextOf?: () => string
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
    getEntityList: () => Array<{id: number; mesh: Object3D}>
    spawnAt: (x: number, y: number, z: number) => void
    /** 每个物理步末记录渲染插值状态（可选，静态系统可缺省） */
    captureRenderState?: () => void
    /** 渲染帧写变换：alpha ∈ [0,1) 为两个物理状态之间的插值系数 */
    syncPositions: (alpha?: number) => void
    /** 设置实体位置与旋转（度）；角色等不支持旋转的系统可忽略 rotDeg */
    setTransform: (id: number, pos: XYZ, rotDeg: XYZ) => void
}

export type {EntityPanelInfo, EntityInfoSource}
