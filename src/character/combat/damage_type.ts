/**
 * 攻击类别（物理 / 魔法）：
 * 武器固有属性（`MeleeWeaponConfig.damageType` / `RangedWeaponConfig.damageType`），
 * 随伤害事件（`DamageEvent.damageType`）流经整条伤害链路，决定按哪一类防御结算固定减伤。
 */
export const DAMAGE_TYPES = ['physical', 'magic'] as const
export type DamageType = typeof DAMAGE_TYPES[number]

/** 攻击类别中文名（面板 / HUD / 文档） */
export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
    physical: '物理',
    magic: '魔法',
}

/** 逐攻击类别的数值档案（防御 / 攻击加成等共用） */
export type DamageTypeProfile = Readonly<Record<DamageType, number>>
