import type {Group} from 'three'
import type {BodyAppearance, BodyForm} from '../../body_form/common/types.ts'
import {createCreatureAnimationSystem} from '../common/creature_runtime/animation.ts'
import {createCreatureAppearance, createCreatureModel} from '../common/creature_runtime/model.ts'
import {wyvernAttackClip, wyvernBaseClip} from './skeleton_animation/clips.ts'
import {WYVERN_PARTS} from './appearance/parts.ts'
import {createWyvernEquipmentAppearance} from './appearance/equipment.ts'
import {buildWyvernSkeleton, WYVERN_COLLIDER_LAYOUT} from './skeleton/skeleton.ts'
import {WYVERN_HURT_BLOCKS} from './skeleton/hurt.ts'
import {WYVERN_BREATH_MODULES} from './equipment/breath.ts'
import {WYVERN_WEAPONS} from './equipment/weapons.ts'
import {WYVERN_EQUIPMENT_MODULES} from './equipment/modules.ts'
import {WYVERN_EQUIP_SLOTS} from './state/equip_slots.ts'
import {WYVERN_STATE} from './state/form_state.ts'
import {WYVERN_ARMOR_PIECES} from './equipment/armor.ts'
import {WYVERN_LIMB_PIECES} from './equipment/limb.ts'

export const WYVERN_BODY_FORM_ID = 'wyvern'

/**
 * 双足飞龙（wyvern，双足 + 双翼，共 4 肢）体形计划。
 * 主武器固定为 `wyvern_claw`（五段爪击）；重击来自独立 `breath` 装备槽。
 */
export const WYVERN_BODY_FORM: BodyForm = {
    id: WYVERN_BODY_FORM_ID,
    nameKey: 'body_form.wyvern',
    state: WYVERN_STATE,
    skeleton: {
        build: buildWyvernSkeleton,
        colliderLayout: WYVERN_COLLIDER_LAYOUT,
        hurtProfile: WYVERN_HURT_BLOCKS,
    },
    assemble: (groups: ReadonlyMap<string, Group>): BodyAppearance =>
        createCreatureAppearance(groups, WYVERN_PARTS, WYVERN_COLLIDER_LAYOUT),
    createModel: (config) => createCreatureModel({
        skeleton: buildWyvernSkeleton(),
        parts: WYVERN_PARTS,
        mainMountId: 'mouthMount',
        colliderLayout: WYVERN_COLLIDER_LAYOUT,
        equipSlots: WYVERN_EQUIP_SLOTS,
        equipmentAppearance: createWyvernEquipmentAppearance,
        scale: config.scale,
    }),
    createAnimation: createCreatureAnimationSystem({
        clipForState: state => wyvernBaseClip(state),
        clipForSegment: segment => wyvernAttackClip(segment),
        skeleton: buildWyvernSkeleton,
    }),
    equipSlots: WYVERN_EQUIP_SLOTS,
    equipmentModules: WYVERN_EQUIPMENT_MODULES,
    armorPieces: WYVERN_ARMOR_PIECES,
    limbPieces: WYVERN_LIMB_PIECES,
    weapons: WYVERN_WEAPONS,
    defaultWeaponId: 'wyvern_claw',
    editor: {weaponControl: true, handedness: false},
    breathModules: WYVERN_BREATH_MODULES,
}
