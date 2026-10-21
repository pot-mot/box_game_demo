import {HUMANOID_BODY_FORM, HUMANOID_BODY_FORM_ID} from '../forms/humanoid/body_form.ts'
import {WOLF_BODY_FORM, WOLF_BODY_FORM_ID} from '../forms/wolf/body_form.ts'
import {HORSE_BODY_FORM, HORSE_BODY_FORM_ID} from '../forms/horse/body_form.ts'
import {WYVERN_BODY_FORM, WYVERN_BODY_FORM_ID} from '../forms/wyvern/body_form.ts'
import type {BodyForm} from './types.ts'
import type {WeaponConfig} from '../../../character/weapon/catalog.ts'
import {registerFormWeapons} from '../../../character/weapon/catalog.ts'
import {registerBreathModules} from '../../../character/weapon/breath_module.ts'

/**
 * 某体形是否可选择某武器：武器只属于一种体形，故**仅当武器归属该体形时可选**。
 * （武器数据由各体形 `forms/<form>/weapons.ts` 拥有，见 `BodyForm.weapons`。）
 */
export const weaponSelectableFor = (form: BodyForm, weapon: WeaponConfig): boolean => weapon.formId === form.id

export type {BodyForm, BodyAppearance, BodySize, ColliderSpec, EquipSlotSet} from './types.ts'
export {
    HUMANOID_BODY_FORM, HUMANOID_BODY_FORM_ID,
    WOLF_BODY_FORM, WOLF_BODY_FORM_ID, HORSE_BODY_FORM, HORSE_BODY_FORM_ID, WYVERN_BODY_FORM, WYVERN_BODY_FORM_ID,
}

/**
 * 全部已注册体形计划（键 = 体形 id）。
 * 每个体形由 `forms/<form>/` 分包提供其骨架 / 外观 / 动画系统 / 碰撞布局 / 受击子块 / 装备槽 / 武器策略。
 */
export const BODY_FORMS: Readonly<Record<string, BodyForm>> = {
    [HUMANOID_BODY_FORM.id]: HUMANOID_BODY_FORM,
    [WOLF_BODY_FORM.id]: WOLF_BODY_FORM,
    [HORSE_BODY_FORM.id]: HORSE_BODY_FORM,
    [WYVERN_BODY_FORM.id]: WYVERN_BODY_FORM,
}

/** 全部体形 id（面板下拉枚举用） */
export const BODY_FORM_IDS: readonly string[] = Object.keys(BODY_FORMS)

/* 把各体形的武器注册进武器目录（装配 BODY_FORMS 时一次性完成；武器数据由体形拥有） */
for (const form of Object.values(BODY_FORMS)) {
    registerFormWeapons(form.id, form.weapons)
    if (form.breathModules !== undefined) registerBreathModules(form.breathModules)
}

/** 按 id 取体形计划；未知 / 缺省 id 安全回退人形（存档容错） */
export const bodyFormOf = (id: string | undefined): BodyForm =>
    (id !== undefined ? BODY_FORMS[id] : undefined) ?? HUMANOID_BODY_FORM

/** id 是否为已知体形（存档校验 / 面板提示用） */
export const isKnownBodyFormId = (id: string): boolean => BODY_FORMS[id] !== undefined
