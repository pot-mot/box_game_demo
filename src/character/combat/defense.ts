import type {DamageTypeProfile} from './damage_type.ts'
import {MIN_DAMAGE} from './constants.ts'

/** 逐攻击类别防御（固定减伤值）；数值档案通用类型见 DamageTypeProfile */
export type DefenseProfile = DamageTypeProfile

/** 零数值档案（角色基础防御 / 攻击加成缺省值） */
export const ZERO_PROFILE: DamageTypeProfile = {physical: 0, magic: 0}

/** 逐类别数值求和（防御 / 攻击加成共用） */
export const addDamageProfiles = (a: DamageTypeProfile, b: DamageTypeProfile): DamageTypeProfile => ({
    physical: a.physical + b.physical,
    magic: a.magic + b.magic,
})

/**
 * 固定减伤：最终伤害 = 原始伤害 < MIN_DAMAGE 时保持原值，否则 max(MIN_DAMAGE, 伤害 − 对应类别防御)。
 * 最小伤害托底只抬高被减免后的结果，不会把小于 MIN_DAMAGE 的原始伤害放大；
 * 零/负伤害不参与结算。
 */
export const reduceByDefense = (amount: number, defense: number): number =>
    amount < MIN_DAMAGE ? amount : Math.max(MIN_DAMAGE, amount - defense)
