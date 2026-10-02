import type {WeaponMeshConfig} from '../../entity/character/appearance/weapon_mesh.ts'
import type {ChargeTuning} from './charge_tuning.ts'

/**
 * 武器类 / 武器模型分层：
 *
 * - **武器类（weapon class）**：玩法数据的归属单位（伤害/攻击类别/持握模式/攻击链）；
 *   攻击段 id、动画资产键、连段编排都以类 id 命名，同类下的全部模型共享。
 * - **武器模型（weapon model）**：类下的一个具体武器实例（模型 + 名称）；存档 / 面板 / 展示使用模型 id。
 *
 * 当前每个类只有唯一默认模型（模型 id = 类 id）；未来同类可挂多个模型（仅外观 / 名称不同）。
 * **双持**要求主/副手属于同一武器类（`catalog.ts` 的 `sameWeaponClass` / `isDualWieldPair`）。
 */
export interface WeaponModelConfig {
    /** 模型 id（存档记录、下拉显示、运行时查询键） */
    readonly id: string
    /** 所属武器类 id（玩法数据与攻击链的键） */
    readonly classId: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
    /**
     * 蓄力调参覆盖（可选）：单武器（模型）覆盖所属武器模板的默认 `maxChargeMultiplier` / `maxChargeTime`；
     * 未声明的字段沿用模板默认。
     */
    readonly charge?: Partial<ChargeTuning>
}
