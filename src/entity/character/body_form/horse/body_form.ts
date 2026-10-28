import type {Group} from 'three'
import type {BodyAppearance, BodyForm} from '../../body_form/common/types.ts'
import {createCreatureAppearance, createCreatureModel} from '../common/creature_runtime/model.ts'
import {HORSE_ANIMATION} from './skeleton_animation/system.ts'
import {HORSE_LIMB_TINT, HORSE_PARTS} from './appearance/parts.ts'
import {createHorseEquipmentAppearance} from './appearance/equipment.ts'
import {buildHorseSkeleton, HORSE_COLLIDER_LAYOUT} from './skeleton/skeleton.ts'
import {HORSE_HURT_BLOCKS} from './skeleton/hurt.ts'
import {HORSE_WEAPONS} from './equipment/weapons.ts'
import {HORSE_EQUIPMENT_MODULES} from './equipment/modules.ts'
import {HORSE_EQUIP_SLOTS} from './state/equip_slots.ts'
import {HORSE_BASE} from './state/form_base.ts'
import {createHorseState} from './state/runtime.ts'
import {HORSE_ARMOR_PIECES, HORSE_ARMOR_SETS} from './equipment/armor.ts'
import {HORSE_LIMB_PIECES} from './equipment/limb.ts'

export const HORSE_BODY_FORM_ID = 'horse'

/**
 * 马（四足）体形计划：状态 / 骨架 / 外观 / 动画 / 装备各自独立来源。
 * 天然武器 `horse_iron_hoof`（铁蹄，melee）为 default。
 */
export const HORSE_BODY_FORM: BodyForm = {
    id: HORSE_BODY_FORM_ID,
    nameKey: 'body_form.horse',
    base: HORSE_BASE,
    createState: createHorseState,
    skeleton: {
        build: buildHorseSkeleton,
        colliderLayout: HORSE_COLLIDER_LAYOUT,
        hurtProfile: HORSE_HURT_BLOCKS,
    },
    assemble: (groups: ReadonlyMap<string, Group>): BodyAppearance =>
        createCreatureAppearance(groups, HORSE_PARTS, HORSE_COLLIDER_LAYOUT),
    createModel: (config) => createCreatureModel({
        skeleton: buildHorseSkeleton(),
        parts: HORSE_PARTS,
        mainMountId: 'mouthMount',
        colliderLayout: HORSE_COLLIDER_LAYOUT,
        equipSlots: HORSE_EQUIP_SLOTS,
        equipmentAppearance: createHorseEquipmentAppearance,
        limbTint: HORSE_LIMB_TINT,
        scale: config.scale,
    }),
    animation: HORSE_ANIMATION,
    equipSlots: HORSE_EQUIP_SLOTS,
    equipmentModules: HORSE_EQUIPMENT_MODULES,
    armorPieces: HORSE_ARMOR_PIECES,
    limbPieces: HORSE_LIMB_PIECES,
    armorSets: HORSE_ARMOR_SETS,
    weapons: HORSE_WEAPONS,
    defaultWeaponLoadout: {hooves: 'horse_iron_hoof'},
    editor: {weaponControl: true, handedness: false},
    /* 四足：翻滚改为低伏冲刺，不做前滚翻 */
    uprightRoot: false,
    rollSpinTurns: 0,
}
