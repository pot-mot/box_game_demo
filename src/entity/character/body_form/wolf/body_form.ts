import type {Group} from 'three'
import type {BodyAppearance, BodyForm} from '../../body_form/common/types.ts'
import {createCreatureAnimationSystem} from '../common/creature_runtime/animation.ts'
import {createCreatureAppearance, createCreatureModel} from '../common/creature_runtime/model.ts'
import {WOLF_PARTS} from './appearance/appearance.ts'
import {createWolfEquipmentAppearance} from './appearance/equipment.ts'
import {wolfAttackClip, wolfBaseClip} from './skeleton_animation/clips.ts'
import {WOLF_HURT_BLOCKS} from './skeleton/hurt.ts'
import {buildWolfSkeleton, WOLF_COLLIDER_LAYOUT} from './skeleton/skeleton.ts'
import {WOLF_WEAPONS} from './equipment/weapons.ts'
import {WOLF_EQUIPMENT_MODULES} from './equipment/modules.ts'
import {WOLF_EQUIP_SLOTS} from './state/equip_slots.ts'
import {WOLF_STATE} from './state/form_state.ts'
import {WOLF_ARMOR_PIECES} from './equipment/armor.ts'
import {WOLF_LIMB_PIECES} from './equipment/limb.ts'

export const WOLF_BODY_FORM_ID = 'wolf'

/**
 * 狼（四足）体形计划：状态 / 骨架 / 外观 / 动画 / 装备各自独立来源。
 * 天然武器 `wolf_bite`（撕咬，melee）为 default；口部挂点 `mouthMount` 可含短剑 / 长剑（口含剑）。
 */
export const WOLF_BODY_FORM: BodyForm = {
    id: WOLF_BODY_FORM_ID,
    nameKey: 'body_form.wolf',
    state: WOLF_STATE,
    skeleton: {
        build: buildWolfSkeleton,
        colliderLayout: WOLF_COLLIDER_LAYOUT,
        hurtProfile: WOLF_HURT_BLOCKS,
    },
    assemble: (groups: ReadonlyMap<string, Group>): BodyAppearance =>
        createCreatureAppearance(groups, WOLF_PARTS, WOLF_COLLIDER_LAYOUT),
    createModel: (config) => createCreatureModel({
        skeleton: buildWolfSkeleton(),
        parts: WOLF_PARTS,
        mainMountId: 'mouthMount',
        colliderLayout: WOLF_COLLIDER_LAYOUT,
        equipSlots: WOLF_EQUIP_SLOTS,
        equipmentAppearance: createWolfEquipmentAppearance,
        scale: config.scale,
    }),
    createAnimation: createCreatureAnimationSystem({
        clipForState: state => wolfBaseClip(state),
        clipForSegment: segment => wolfAttackClip(segment),
        skeleton: buildWolfSkeleton,
    }),
    equipSlots: WOLF_EQUIP_SLOTS,
    equipmentModules: WOLF_EQUIPMENT_MODULES,
    armorPieces: WOLF_ARMOR_PIECES,
    limbPieces: WOLF_LIMB_PIECES,
    weapons: WOLF_WEAPONS,
    defaultWeaponId: 'wolf_bite',
    editor: {weaponControl: true, handedness: false},
    rollSpinTurns: 0,
}
