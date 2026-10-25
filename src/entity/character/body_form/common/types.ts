import type {Group, Mesh} from 'three'
import type {StringLocaleKey} from '../../../../i18n/index.ts'
import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import type {SkeletonAppearance} from '../../../skeleton/appearance.ts'
import type {TrackedBoxPart} from '../../../../render/box_parts.ts'
import type {HurtBlockProfile} from '../../../../character/hurt_blocks.ts'
import type {CharacterConfig, CharacterEntity} from '../../../../character/types.ts'
import type {CharacterState, CharacterStateInit} from '../../../../character/state/types.ts'
import type {CreatureModel} from '../../appearance/types.ts'
import type {FormAnimation} from './skeleton_animation/form_animation.ts'
import type {EquipSlotDef, EquipmentModuleDef, EquipmentState} from '../../../../character/equipment/types.ts'
import type {BodyFormBase} from './base.ts'
import type {MeshBuilder} from '../../appearance/mesh_builder.ts'

/**
 * 体形计划（BodyForm）：一个体形的完整定义 —— 状态 / 骨架 / 外观 / 动画 / 装备。
 *
 * `state` 是原始数值与动画时长基线的唯一来源；`skeleton` 是关节、碰撞箱与受击箱的唯一来源；
 * `appearance` 只消费二者的派生结果，不得反向影响碰撞/受击数据。
 */

/** 体形碰撞形状（节点相对模型根驱动；尺寸为 scale=1） */
export type ColliderSpec =
    | {
        readonly nodeId: string
        readonly kind: 'capsule'
        readonly radius: number
        /** 中间圆柱半高（CapsuleGeometry 语义：总高 = 2×halfHeight + 2×radius） */
        readonly halfHeight: number
        /** 相对刚体中心的初始 Y 偏移（scale=1；首帧前用，之后由节点作为驱动源） */
        readonly offsetY: number
    }
    | {
        readonly nodeId: string
        readonly kind: 'box'
        readonly half: { readonly x: number; readonly y: number; readonly z: number }
        readonly offsetY: number
    }

/** 体形基础尺寸（scale=1；有效尺寸 = size × config.scale） */
export interface BodySize {
    readonly width: number
    readonly height: number
    readonly depth: number
}

/** 体形骨架定义：关节层级 / 骨骼段 / 碰撞布局 / 受击块的唯一来源 */
export interface BodySkeletonDefinition {
    /** 骨架工厂（含物理碰撞节点；避免共享可变状态） */
    readonly build: () => SkeletonDefinition
    /** 关节 id → 本地化名键（缺省回退关节原始名） */
    readonly jointNameKeys?: Readonly<Record<string, StringLocaleKey>>
    /** 物理碰撞布局（含主碰撞体：首个 spec 的节点即地面/分离主引用） */
    readonly colliderLayout: readonly ColliderSpec[]
    /** 受击子块清单（尺寸只由骨架数据决定，不读取外观几何） */
    readonly hurtProfile: HurtBlockProfile
}

/** 体形外观装配结果：通用外观 + 关节部件 + 碰撞可视化 */
export interface BodyAppearance extends SkeletonAppearance {
    readonly jointParts: ReadonlyMap<string, TrackedBoxPart>
    readonly colliderMeshes: readonly Mesh[]
}

/** 装备外观构建上下文（由体形 appearance 分包提供） */
export interface EquipmentAppearanceContext {
    readonly groups: ReadonlyMap<string, Group>
    readonly builder: MeshBuilder
    readonly equipSlots: readonly EquipSlotDef[]
}

/** 装备外观句柄：换装 / 释放时统一回收几何与材质 */
export interface EquipmentAppearanceHandle {
    readonly dispose: () => void
}

/** 体形装备外观构建器：只创建视觉子节点，不修改骨架/动画/碰撞 */
export type EquipmentAppearanceBuilder = (state: EquipmentState, ctx: EquipmentAppearanceContext) => EquipmentAppearanceHandle

export interface BodyForm {
    /** 体形 id（持久化键 / 面板选择值） */
    readonly id: string
    /** 体形本地化显示名键 */
    readonly nameKey: StringLocaleKey

    /** 基础定义：基础属性、尺寸、动画基线、最终数值计算入口 */
    readonly base: BodyFormBase
    /** 具体体形 state 工厂：生产角色生成时唯一入口 */
    readonly createState: (init: CharacterStateInit) => CharacterState
    /** 骨架：关节 / 骨骼段 / 碰撞箱 / 受击箱的唯一真源 */
    readonly skeleton: BodySkeletonDefinition

    /** 外观装配器（挂部件 + 注册 jointParts + 碰撞可视化；只读骨架派生数据） */
    readonly assemble: (groups: ReadonlyMap<string, Group>, palette: import('../../../../render/box_parts.ts').BoxPartPalette) => BodyAppearance
    /** 固定调色板（可选）：声明后外观不随阵营重着色（供体形固有的固定配色使用） */
    readonly palette?: import('../../../../render/box_parts.ts').BoxPartPalette

    /** 体形渲染模型工厂（各体形分包自带） */
    readonly createModel: (config: CharacterConfig, faction: number) => CreatureModel

    /**
     * 体形动画定义 —— 运行时系统与骨骼编辑器内置动作共用同一份 clip provider。
     * 世界主循环只消费 `animation.createSystem`。
     */
    readonly animation: FormAnimation

    /** 装备槽集合（limb / weapon / armor；槽位键 = kind:bodyPart） */
    readonly equipSlots: readonly EquipSlotDef[]
    /** 装备模组（同模组共享槽位骨骼配置；每件装备只属于一个模组） */
    readonly equipmentModules: readonly EquipmentModuleDef[]
    /** 该体形拥有的全部武器（武器只属于一种体形） */
    readonly weapons: readonly import('../../../../character/weapon/catalog.ts').WeaponConfig[]
    /**
     * 每个武器槽 bodyPart → 默认天然武器 id（须在 `weapons` / `breathModules` 内）。
     * 槽位缺失、存档值为 null / undefined / 未知 id 时按此回填。
     */
    readonly defaultWeaponLoadout: Readonly<Record<string, string>>

    /** 骨骼编辑器能力声明（避免编辑器按体形 id 硬编码） */
    readonly editor: {
        readonly weaponControl: boolean
        readonly handedness: boolean
    }

    /** 该体形可物品化的护甲 / 肢体预设（注册进跨体形目录；缺省 = 仅人形目录） */
    readonly armorPieces?: readonly import('../../../../character/armor/types.ts').ArmorPieceConfig[]
    readonly limbPieces?: readonly import('../../../../character/armor/types.ts').LimbPieceConfig[]

    /** 该体形拥有的吐息模组（独立装备槽；缺省 = 无） */
    readonly breathModules?: readonly import('../../../../character/weapon/breath_module.ts').BreathModuleConfig[]

    /**
     * 翻滚根自转圈数（可选；缺省 1 = 前滚翻一周，人形默认）。
     */
    readonly rollSpinTurns?: number

    /**
     * 基准姿态是否为竖直站立（缺省 true）。俯卧体形（狼 / 马 / 飞龙）为 false：
     * 游泳 / 死亡 / 倒地 / 起身不再叠加「向地面旋转」的根姿态，仅保留朝向 yaw。
     */
    readonly uprightRoot?: boolean

    /** 每帧体形专属同步（可选；在受击块/碰撞体同步之外调用） */
    readonly onFrame?: (entity: CharacterEntity, model: CreatureModel) => void
}
