import type {Group, Mesh} from 'three'
import type {StringLocaleKey} from '../../../../i18n/index.ts'
import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import type {SkeletonAppearance} from '../../../skeleton/appearance.ts'
import type {TrackedBoxPart} from '../../../../render/box_parts.ts'
import type {HurtBlockProfile} from '../../../../character/hurt_blocks.ts'
import type {CharacterConfig, CharacterEntity} from '../../../../character/types.ts'
import type {CreatureModel} from '../../appearance/types.ts'
import type {AppearanceSystem, AppearanceSystemOptions} from '../../appearance/types.ts'
import type {EquipSlotDef} from '../../../../character/equipment/types.ts'

/**
 * 体形计划（BodyForm）：一个体形的完整定义 —— 骨架 / 外观 / 碰撞布局 / 受击子块 /
 * 尺寸与中心偏移 / 基础生命 / 装备槽集合 / 武器策略 / 关节本地化名。
 *
 * 位于实体层（`entity/character/`），因为它组合了外观装配器、骨架预设与受击块等实体资源；
 * 纯领域数据（受击块类型、武器、护甲）仍在 `character/`。
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

/** 体形外观装配结果：通用外观 + 关节部件 + 碰撞可视化 */
export interface BodyAppearance extends SkeletonAppearance {
    readonly jointParts: ReadonlyMap<string, TrackedBoxPart>
    readonly colliderMeshes: readonly Mesh[]
}

export interface BodyForm {
    /** 体形 id（持久化键 / 面板选择值） */
    readonly id: string
    /** 体形本地化显示名键 */
    readonly nameKey: StringLocaleKey

    /** 骨架定义工厂（含物理碰撞节点；避免共享可变状态） */
    readonly buildSkeleton: () => SkeletonDefinition
    /** 关节 id → 本地化名键（缺省回退关节原始名） */
    readonly jointNameKeys?: Readonly<Record<string, StringLocaleKey>>

    /** 物理碰撞布局（含主碰撞体：首个 spec 的节点即地面/分离主引用） */
    readonly colliderLayout: readonly ColliderSpec[]
    /** 脚底原点到刚体中心的 Y（scale=1；乘 config.scale） */
    readonly centerOffsetY: number
    /** 眼部高度（scale=1，脚底原点起算；视线扇形 / 瞄准目标点用） */
    readonly eyeHeight: number
    /** 基础尺寸（scale=1） */
    readonly size: BodySize
    /** 基础生命值（缺省 = 沿用武器类型档位：近战 15 / 远程 8） */
    readonly baseHealth?: number

    /** 受击子块清单 */
    readonly hurtProfile: HurtBlockProfile

    /** 外观装配器（挂部件 + 注册 jointParts + 碰撞可视化） */
    readonly assemble: (groups: ReadonlyMap<string, Group>, palette: import('../../../../render/box_parts.ts').BoxPartPalette) => BodyAppearance
    /** 固定调色板（可选）：声明后外观不随阵营重着色（供体形固有的固定配色使用） */
    readonly palette?: import('../../../../render/box_parts.ts').BoxPartPalette

    /** 体形渲染模型工厂（各体形分包自带；人形 = createCharacterModel，生物 = createCreatureModel） */
    readonly createModel: (config: CharacterConfig, faction: number) => CreatureModel

    /**
     * 体形专属动画系统工厂 —— **每个体形分包自带**其 `base_clips.ts` / `pose_fns.ts` 与 clip 调度实现
     * （人形 / 狼 / 马 / 双足飞龙 wyvern 骨骼与步态完全不同，不做跨体形参数化）。世界主循环只消费本接口
     * （`onStateChange` / `update`），不感知具体体形的动画数据。
     */
    readonly createAnimation: (options: AppearanceSystemOptions) => AppearanceSystem

    /** 装备槽集合（limb / weapon / armor；槽位键 = kind:bodyPart） */
    readonly equipSlots: readonly EquipSlotDef[]
    /** 该体形拥有的全部武器（武器只属于一种体形；由 `forms/<form>/weapons.ts` 声明） */
    readonly weapons: readonly import('../../../../character/weapon/catalog.ts').WeaponConfig[]
    /** 默认武器 id（须在 `weapons` 内；无武器 / 无持械体形回退，如空手 `unarmed` / 天然） */
    readonly defaultWeaponId: string

    /** 骨骼编辑器能力声明（避免编辑器按体形 id 硬编码） */
    readonly editor: {
        readonly weaponControl: boolean
        readonly handedness: boolean
    }

    /** 该体形可物品化的护甲 / 肢体预设（跨体形注册；缺省 = 仅人形目录） */
    readonly armorPieces?: readonly import('../../../../character/armor/types.ts').ArmorPieceConfig[]
    readonly limbPieces?: readonly import('../../../../character/armor/types.ts').LimbPieceConfig[]

    /** 该体形拥有的吐息模组（独立装备槽；缺省 = 无） */
    readonly breathModules?: readonly import('../../../../character/weapon/breath_module.ts').BreathModuleConfig[]

    /**
     * 翻滚根自转圈数（可选；缺省 1 = 前滚翻一周，人形默认）。
     * 四足（狼 / 马）宜设 0（低伏冲刺，不做前滚翻），飞龙可保留 1；由 `world.ts` 的翻滚根姿态合成读取。
     */
    readonly rollSpinTurns?: number

    /** 每帧体形专属同步（可选；在受击块/碰撞体同步之外调用，如游泳俯卧根姿态） */
    readonly onFrame?: (entity: CharacterEntity, model: CreatureModel) => void
}
