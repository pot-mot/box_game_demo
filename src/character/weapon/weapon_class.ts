import type {WeaponAttackBoxSpec, WeaponMeshConfig} from './mesh_config.ts'
import type {EquipmentColliderSpec, EquipmentHurtBoxSpec, EquipmentMountSpec} from '../equipment/types.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import type {ChargeTuning} from './charge_tuning.ts'

/**
 * 武器类 / 武器模型分层：
 *
 * - **武器类（weapon class）**：玩法数据的归属单位（伤害/攻击类别/持握模式/攻击链）；
 *   攻击段 id、动画资产键、连段编排都以类 id 命名，同类下的全部模型共享。
 * - **武器模型（weapon model）**：类下的一个具体武器实例（模型 + 名称）；存档 / 面板 / 展示使用模型 id。
 *
 * **体形归属（formId）**：每个武器模型属于**唯一体形**（`BodyForm.id`），只在所属体形的
 * `forms/<form>/weapons.ts` 中声明；不同体形即使复用同一网格生成器也是各自独立的武器条目。
 *
 * **双持**要求主/副手属于同一武器类（`catalog.ts` 的 `sameWeaponClass` / `isDualWieldPair`）。
 */
export interface WeaponModelConfig {
    /** 模型 id（存档记录、下拉显示、运行时查询键；全局唯一） */
    readonly id: string
    /** 所属武器类 id（玩法数据与攻击链的键） */
    readonly classId: string
    /** 所属体形 id（`BodyForm.id`）；武器只对应一种体形 */
    readonly formId: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    /** 武器名本地化键（UI 展示统一经此取用） */
    readonly nameKey: StringLocaleKey
    /**
     * 该武器可装备的部位 id（对应体形 `EquipSlotDef.bodyPart`，如 `main_hand` / `off_hand` /
     * `claw` / `head` / `hooves` / `wing_claw` / `breath`）。天然武器不在物品表，但仍声明部位。
     */
    readonly equipBodyParts: readonly string[]
    /** 程序化武器模型（主手 / 右手；未声明 `mounts` 时作为默认单挂载模型） */
    readonly mesh: WeaponMeshConfig
    /**
     * 逐骨骼节点挂载配置（可选）：多肢体天然武器（马蹄 / 狼爪 / 龙翼爪）逐关节声明模型、偏移与旋转。
     * 缺省 = 由槽位/惯用手解析单一主挂点。
     */
    readonly mounts?: readonly EquipmentMountSpec<WeaponMeshConfig>[]
    /** 攻击箱数组（可选；天然武器显式声明，普通武器缺省由网格模板生成） */
    readonly attackBoxes?: readonly WeaponAttackBoxSpec[]
    /** 装备扩展碰撞体（现有武器为空数组） */
    readonly colliders?: readonly EquipmentColliderSpec[]
    /** 装备扩展受击箱（现有武器为空数组） */
    readonly hurtBoxes?: readonly EquipmentHurtBoxSpec[]
    /**
     * 蓄力调参覆盖（可选）：单武器（模型）覆盖所属武器模板的默认 `maxChargeMultiplier` / `maxChargeTime`；
     * 未声明的字段沿用模板默认。
     */
    readonly charge?: Partial<ChargeTuning>
}
