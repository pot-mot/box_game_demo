import type {Group} from 'three'
import type {BoxPartPalette} from '../../../../render/box_parts.ts'
import {ARMOR_SLOTS, LIMB_SLOTS} from '../../../../character/armor/slots.ts'
import {buildCharacterSkeletonDefinition, HUMANOID_JOINT_NAME_KEYS} from './skeleton.ts'
import {HUMANOID_HURT_BLOCKS} from './hurt.ts'
import {assembleCharacterAppearance} from './assemble.ts'
import {createCharacterModel} from './model.ts'
import {createAppearanceSystem} from './system.ts'
import type {BodyAppearance, BodyForm, ColliderSpec} from '../../body_form/types.ts'
import type {CharacterConfig} from '../../../../character/types.ts'
import type {CharacterModel} from './types.ts'
import {HUMANOID_WEAPONS} from './weapons.ts'

/** 人形体形 id */
export const HUMANOID_BODY_FORM_ID = 'humanoid'

/** 人形基础尺寸（scale=1）：人形是几何真源，其余体形各自声明自己的尺寸 */
const HUMANOID_SIZE = {width: 0.25, height: 1, depth: 0.1625} as const
/** 人形眼高（脚底起算，scale=1） */
const HUMANOID_EYE_HEIGHT = 0.4

/**
 * 人形上下半竖直胶囊碰撞布局：
 * 半径 = 碰撞箱半宽、中间圆柱半高 = (总半高 − 半径)/2（两半竖直拼接等价原单胶囊）。
 */
const capsuleRadius = HUMANOID_SIZE.width / 2
const capsuleHalfHeight = HUMANOID_SIZE.height / 2 - capsuleRadius
const halfCapsuleHalfHeight = capsuleHalfHeight / 2

const HUMANOID_COLLIDER_LAYOUT: readonly ColliderSpec[] = [
    {nodeId: 'lowerBodyCollider', kind: 'capsule', radius: capsuleRadius, halfHeight: halfCapsuleHalfHeight, offsetY: -halfCapsuleHalfHeight},
    {nodeId: 'upperBodyCollider', kind: 'capsule', radius: capsuleRadius, halfHeight: halfCapsuleHalfHeight, offsetY: halfCapsuleHalfHeight},
]

/**
 * 人形体形计划：字段与既有常量逐一对应，保证引入抽象后行为完全不变。
 * 无武器时的 default 分配 = 空手 `unarmed`。
 */
export const HUMANOID_BODY_FORM: BodyForm = {
    id: HUMANOID_BODY_FORM_ID,
    nameKey: 'body_form.humanoid',
    buildSkeleton: buildCharacterSkeletonDefinition,
    jointNameKeys: HUMANOID_JOINT_NAME_KEYS,
    colliderLayout: HUMANOID_COLLIDER_LAYOUT,
    centerOffsetY: HUMANOID_SIZE.height / 2,
    /* 人形眼高：原 AI 视线扇形取 height × 0.4，此处显式化 */
    eyeHeight: HUMANOID_EYE_HEIGHT,
    size: HUMANOID_SIZE,
    hurtProfile: HUMANOID_HURT_BLOCKS,
    assemble: (groups: ReadonlyMap<string, Group>, palette: BoxPartPalette): BodyAppearance =>
        assembleCharacterAppearance(groups, palette),
    createModel: (config, faction) => createCharacterModel(config, faction, HUMANOID_BODY_FORM),
    /* 人形动画系统（体形专属分包；狼 / 马 / 双足飞龙 wyvern 各自提供自己的实现） */
    createAnimation: createAppearanceSystem,
    equipSlots: {armor: ARMOR_SLOTS, limb: LIMB_SLOTS, weapon: true},
    weapons: HUMANOID_WEAPONS,
    defaultWeaponId: 'unarmed',
    editor: {weaponControl: true, handedness: true},
}

/** 人形模型便捷工厂：调用方已确定是人形体形时使用 */
export const createHumanoidModel = (config: CharacterConfig, faction: number): CharacterModel =>
    createCharacterModel(config, faction, HUMANOID_BODY_FORM)
