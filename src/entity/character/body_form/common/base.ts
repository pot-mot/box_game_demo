import type {BaseClipState} from '../../../../character/state_machine/types.ts'
import type {WeaponConfig} from '../../../../character/weapon/catalog.ts'
import type {EquipmentState} from '../../../../character/equipment/types.ts'
import type {DefenseProfile} from '../../../../character/combat/defense.ts'
import type {DamageTypeProfile} from '../../../../character/combat/damage_type.ts'
import {ZERO_PROFILE, addDamageProfiles} from '../../../../character/combat/defense.ts'
import {
    equipmentAttackOf,
    equipmentDefenseOf,
    equipmentMoveSpeedOf,
    equipmentPoiseOf,
    resolveEquipmentPieces,
} from '../../../../character/armor/catalog.ts'
import type {BodySize} from './types.ts'

/** 基础状态时长（状态系统与动画系统共用；体形可覆写视觉状态时长） */
export type BodyClipStateMeta = Readonly<Record<BaseClipState, {readonly duration: number; readonly loop: boolean}>>

/**
 * 体形基础定义（装备/武器修正前的唯一来源）：
 * 基础属性 + 尺寸 + 动画时长基线；最终数值由 `resolveBodyFormBase` 统一计算。
 */
export interface BodyFormBase {
    readonly size: BodySize
    /** 脚底原点到刚体中心的 Y（scale=1） */
    readonly centerOffsetY: number
    /** 眼部高度（scale=1，脚底原点起算） */
    readonly eyeHeight: number
    /** 基础生命值（固定值或按武器类型推导） */
    readonly baseHealth: number | ((weapon: WeaponConfig) => number)
    /** 基础逐类别防御（存档覆写优先） */
    readonly baseDefense: DefenseProfile
    /** 基础逐类别攻击加成（存档覆写优先） */
    readonly baseAttack: DamageTypeProfile
    /** 基础移速乘数（装备乘数在其上叠加） */
    readonly baseMoveSpeedMultiplier: number
    /** 基础韧性上限 */
    readonly basePoise: number
    /** 基础状态时长（动画/状态系统读取） */
    readonly animation: BodyClipStateMeta
}

/** 体形最终数值（基础属性 + 装备 + 武器） */
export interface BodyFormResolved {
    readonly maxHealth: number
    readonly defense: DefenseProfile
    readonly attackBonus: DamageTypeProfile
    readonly moveSpeedMultiplier: number
    readonly poise: number
}

/** 计算体形最终数值：装备按体形槽位 fail-closed 解析后汇总 */
export const resolveBodyFormBase = (
    base: BodyFormBase,
    weapon: WeaponConfig,
    equipment: EquipmentState,
    bodyFormId: string,
): BodyFormResolved => {
    const pieces = resolveEquipmentPieces(equipment, bodyFormId)
    return {
        maxHealth: typeof base.baseHealth === 'function'
            ? base.baseHealth(weapon)
            : base.baseHealth,
        defense: equipmentDefenseOf(base.baseDefense, pieces),
        attackBonus: addDamageProfiles(base.baseAttack, equipmentAttackOf(pieces)),
        moveSpeedMultiplier: base.baseMoveSpeedMultiplier * equipmentMoveSpeedOf(pieces),
        poise: base.basePoise + equipmentPoiseOf(pieces),
    }
}

/** 零基础档案（供体形按需组合；避免各状态文件重复字面量） */
export const ZERO_BASE = {
    baseDefense: ZERO_PROFILE,
    baseAttack: ZERO_PROFILE,
} as const
