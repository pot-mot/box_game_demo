import type {Group} from 'three'
import type {BoxPartPalette} from '../../../../render/box_parts.ts'
import {buildCharacterSkeletonDefinition, HUMANOID_COLLIDER_LAYOUT, HUMANOID_JOINT_NAME_KEYS} from './skeleton/skeleton.ts'
import {HUMANOID_HURT_BLOCKS} from './skeleton/hurt.ts'
import {assembleCharacterAppearance} from './appearance/assemble.ts'
import {createCharacterModel} from './appearance/model.ts'
import {createAppearanceSystem} from './skeleton_animation/system.ts'
import type {BodyAppearance, BodyForm} from '../common/types.ts'
import type {CharacterConfig} from '../../../../character/types.ts'
import type {CharacterModel} from './appearance/types.ts'
import {HUMANOID_WEAPONS} from './equipment/weapons.ts'
import {HUMANOID_EQUIPMENT_MODULES} from './equipment/modules.ts'
import {HUMANOID_ARMOR_PIECES} from './equipment/armor.ts'
import {HUMANOID_LIMB_PIECES} from './equipment/limb.ts'
import {HUMANOID_EQUIP_SLOTS} from './state/equip_slots.ts'
import {HUMANOID_STATE} from './state/form_state.ts'

/** 人形体形 id */
export const HUMANOID_BODY_FORM_ID = 'humanoid'

/**
 * 人形体形计划：状态 / 骨架 / 外观 / 动画 / 装备各自独立来源。
 * 无武器时的 default 分配 = 空手 `unarmed`。
 */
export const HUMANOID_BODY_FORM: BodyForm = {
    id: HUMANOID_BODY_FORM_ID,
    nameKey: 'body_form.humanoid',
    state: HUMANOID_STATE,
    skeleton: {
        build: buildCharacterSkeletonDefinition,
        jointNameKeys: HUMANOID_JOINT_NAME_KEYS,
        colliderLayout: HUMANOID_COLLIDER_LAYOUT,
        hurtProfile: HUMANOID_HURT_BLOCKS,
    },
    assemble: (groups: ReadonlyMap<string, Group>, palette: BoxPartPalette): BodyAppearance =>
        assembleCharacterAppearance(groups, palette),
    createModel: (config, faction) => createCharacterModel(config, faction, HUMANOID_BODY_FORM),
    /* 人形动画系统（体形专属分包；狼 / 马 / 双足飞龙 wyvern 各自提供自己的实现） */
    createAnimation: createAppearanceSystem,
    equipSlots: HUMANOID_EQUIP_SLOTS,
    equipmentModules: HUMANOID_EQUIPMENT_MODULES,
    armorPieces: HUMANOID_ARMOR_PIECES,
    limbPieces: HUMANOID_LIMB_PIECES,
    weapons: HUMANOID_WEAPONS,
    defaultWeaponId: 'unarmed',
    editor: {weaponControl: true, handedness: true},
}

/** 人形模型便捷工厂：调用方已确定是人形体形时使用 */
export const createHumanoidModel = (config: CharacterConfig, faction: number): CharacterModel =>
    createCharacterModel(config, faction, HUMANOID_BODY_FORM)
