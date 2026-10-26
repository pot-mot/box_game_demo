import type {Group} from 'three'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {BuildingConfig} from '../../entity/building_generator/validation.ts'
import type {BuildingGeneratorContext} from '../../entity/building_generator/types/index.ts'
import type {BuildingPropKind} from '../../entity/building_generator/props/kinds.ts'
import type {TerrainContext} from '../../entity/terrain/base/types/index.ts'
import type {BaseTerrainConfig} from '../../entity/terrain/base/types/index.ts'
import type {AreaConfig} from '../../entity/area/types/index.ts'
import type {AreaEntityContext} from '../../entity/area/types/index.ts'
import type {BoxConfig} from '../../entity/box/types/index.ts'
import type {BoxEntityContext} from '../../entity/box/types/index.ts'
import type {InteractableConfig, InteractableContext} from '../../entity/interactable/types.ts'
import type {ItemEntityContext} from '../../entity/item/types.ts'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import type {SurfaceMaterialId} from '../../render/materials/index.ts'
import type {OwnershipStore} from '../../types/ownership_store.ts'

/** 蓝图格式版本（与存档格式版本解耦） */
export const DIORAMA_BLUEPRINT_VERSION = 1

/** 节点 / 人口数量上限，防止错误配方导致海量实体 */
export const MAX_DIORAMA_NODES = 64
export const MAX_POPULATION_RULES = 64
export const MAX_POPULATION_TOTAL = 256

export type SlotDirection = '+x' | '-x' | '+z' | '-z'

/** 节点级槽位：相对所在节点局部坐标的位置 + 朝向 */
export interface DioramaSlot {
    readonly id: string
    readonly position: readonly [number, number, number]
    readonly dir: SlotDirection
}

interface DioramaNodeBase {
    readonly nodeId: string
    /** 相对父组（根为箱庭原点）的位置 */
    readonly position: readonly [number, number, number]
    readonly yawQuarter: number
}

export interface BuildingNode extends DioramaNodeBase {
    readonly kind: 'building'
    readonly config: BuildingConfig
    /** 追加到配方默认锚点之外的显式槽位 */
    readonly slots?: readonly DioramaSlot[]
}

export interface TerrainNode extends DioramaNodeBase {
    readonly kind: 'terrain'
    readonly config: BaseTerrainConfig
}

export interface AreaNode extends DioramaNodeBase {
    readonly kind: 'area'
    readonly config: AreaConfig
}

export interface ConnectionNode extends DioramaNodeBase {
    readonly kind: 'connection'
    readonly connectionKind: 'stairs' | 'corridor'
    readonly fromNodeId: string
    readonly fromSlotId: string
    readonly toNodeId: string
    readonly toSlotId: string
    /** 结构写入的目标建筑节点（缺省 = fromNodeId） */
    readonly hostNodeId?: string
    readonly material: SurfaceMaterialId
    readonly width?: number
    readonly railing?: boolean
}

export interface GroupNode extends DioramaNodeBase {
    readonly kind: 'group'
    readonly children: readonly DioramaNode[]
}

export type DioramaNode = BuildingNode | TerrainNode | AreaNode | ConnectionNode | GroupNode

export type PopulationKind = 'character' | 'interactable' | 'item' | 'box' | 'decor'

export type PopulationPlacement = 'ground' | 'roof' | 'interior' | 'anchor'

interface PopulationRuleBase {
    readonly id: string
    readonly kind: PopulationKind
    /** 限制在某个结构节点的足迹内；空串 = 整个箱庭范围 */
    readonly zoneId: string
    readonly placement: PopulationPlacement
    /** 显式锚点（placement = 'anchor' 时必填） */
    readonly anchorNodeId?: string
    readonly anchorSlotId?: string
    readonly count?: number
    readonly density?: number
    readonly minSpacing?: number
}

export interface CharacterPopulationRule extends PopulationRuleBase {
    readonly kind: 'character'
    readonly config: CharacterAddConfig
}

export interface InteractablePopulationRule extends PopulationRuleBase {
    readonly kind: 'interactable'
    readonly config: InteractableConfig
}

export interface ItemPopulationRule extends PopulationRuleBase {
    readonly kind: 'item'
    readonly defId: string
    readonly countPerSpawn?: number
}

export interface BoxPopulationRule extends PopulationRuleBase {
    readonly kind: 'box'
    readonly config: BoxConfig
}

export interface DecorPopulationRule extends PopulationRuleBase {
    readonly kind: 'decor'
    readonly propKind: BuildingPropKind
    readonly material: SurfaceMaterialId
    readonly yawQuarter?: number
}

export type PopulationRule =
    | CharacterPopulationRule
    | InteractablePopulationRule
    | ItemPopulationRule
    | BoxPopulationRule
    | DecorPopulationRule

/** 角色创建配置（取自角色系统 add 的参数类型，避免组合层依赖存档模块） */
export type CharacterAddConfig = Parameters<CharacterEntitySystem['add']>[0]

export interface DioramaBlueprint {
    readonly version: number
    readonly recipeId: string
    readonly seed: number
    readonly nodes: readonly DioramaNode[]
    readonly population: readonly PopulationRule[]
}

export type DiagnosticSeverity = 'error' | 'warning'

export interface DioramaDiagnostic {
    readonly severity: DiagnosticSeverity
    readonly code: string
    readonly message: string
    readonly nodeId?: string
    readonly ruleId?: string
}

export interface ResolvedSlot {
    readonly nodeId: string
    readonly slotId: string
    /** 世界坐标 */
    readonly position: readonly [number, number, number]
    readonly dir: SlotDirection
}

/** 箱庭运行时装配选项（由 main 注入，避免组合层依赖存档模块） */
export interface DioramaOptions {
    /** 解析面板导入的蓝图 JSON；非法结构返回 undefined */
    readonly parseBlueprint?: (input: unknown) => DioramaBlueprint | undefined
}

export interface DioramaPorts {
    readonly building: BuildingGeneratorContext
    readonly ownership: OwnershipStore
    readonly terrain?: TerrainContext
    readonly area?: AreaEntityContext
    readonly box?: BoxEntityContext
    readonly interactable?: InteractableContext
    readonly item?: ItemEntityContext
    readonly character?: CharacterEntitySystem
}

export interface DioramaEntity {
    readonly id: number
    readonly dioramaId: string
    blueprint: DioramaBlueprint
    seed: number
    origin: readonly [number, number, number]
    yawQuarter: number
    /** 无拾取网格的根节点，供 gizmo 跟随与整体变换 */
    readonly root: Group
    diagnostics: readonly DioramaDiagnostic[]
}

export interface DioramaContext extends EntityInfoSource {
    add: (
        blueprint: DioramaBlueprint,
        x: number,
        y: number,
        z: number,
        yawQuarter?: number,
        dioramaId?: string,
        materialize?: boolean,
    ) => DioramaEntity
    getById: (id: number) => DioramaEntity | undefined
    getSelected: () => DioramaEntity | undefined
    getAll: () => readonly DioramaEntity[]
    /** 替换蓝图并重建；校验失败时保留旧子实体并返回诊断 */
    rebuild: (id: number, blueprint: DioramaBlueprint) => readonly DioramaDiagnostic[]
    /** 删除箱庭及全部归属子实体 */
    removeCascade: (id: number) => void
    getDiagnostics: (id: number) => readonly DioramaDiagnostic[]
}
