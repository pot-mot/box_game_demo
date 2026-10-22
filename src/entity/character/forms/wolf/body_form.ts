import type {Group} from 'three'
import type {BodyAppearance, BodyForm, ColliderSpec} from '../../body_form/types.ts'
import {createCreatureAnimationSystem} from '../creature_runtime/animation.ts'
import {createCreatureAppearance, createCreatureModel} from '../creature_runtime/model.ts'
import {WOLF_PARTS} from './appearance.ts'
import {wolfAttackClip, wolfBaseClip} from './clips.ts'
import {WOLF_HURT_BLOCKS} from './hurt.ts'
import {buildWolfSkeleton} from './skeleton.ts'
import {WOLF_WEAPONS} from './weapons.ts'

export const WOLF_BODY_FORM_ID = 'wolf'

/**
 * 狼碰撞布局（胶囊 + 盒，尽量贴合四足轮廓）：
 * - 主碰撞体：**竖直胶囊**（节点 `bodyCollider`），脚底→背部，保证站立高度（地面 / 分离主引用）；
 * - 躯干横胶囊（节点 `torsoCollider`，节点带 90° X 旋转）：覆盖前后体长；
 * - 头部盒（节点 `headCollider`）：覆盖前伸的头/口。
 */
const WOLF_COLLIDER_LAYOUT: readonly ColliderSpec[] = [
    {nodeId: 'bodyCollider', kind: 'capsule', radius: 0.2, halfHeight: 0.25, offsetY: 0},
    {nodeId: 'torsoCollider', kind: 'capsule', radius: 0.2, halfHeight: 0.2, offsetY: 0},
    {nodeId: 'headCollider', kind: 'box', half: {x: 0.12, y: 0.13, z: 0.2}, offsetY: 0},
]

/**
 * 狼（四足）体形计划：自带四足骨架 / 外观 / 动画系统 / 受击子块 / 碰撞布局。
 * 天然武器 `bite`（撕咬，melee）为 default；口部挂点 `mouthMount` 可含短剑 / 长剑（口含剑）。
 */
export const WOLF_BODY_FORM: BodyForm = {
    id: WOLF_BODY_FORM_ID,
    nameKey: 'body_form.wolf',
    buildSkeleton: buildWolfSkeleton,
    colliderLayout: WOLF_COLLIDER_LAYOUT,
    centerOffsetY: 0.45,
    /* 狼眼高：头位略高于躯干中心 */
    eyeHeight: 0.55,
    size: {width: 0.5, height: 0.9, depth: 1.3},
    baseHealth: 12,
    hurtProfile: WOLF_HURT_BLOCKS,
    assemble: (groups: ReadonlyMap<string, Group>): BodyAppearance =>
        createCreatureAppearance(groups, WOLF_PARTS, WOLF_COLLIDER_LAYOUT),
    createModel: (config) => createCreatureModel({
        skeleton: buildWolfSkeleton(),
        parts: WOLF_PARTS,
        mainMountId: 'mouthMount',
        colliderLayout: WOLF_COLLIDER_LAYOUT,
        scale: config.scale,
    }),
    createAnimation: createCreatureAnimationSystem({
        clipForState: state => wolfBaseClip(state),
        clipForSegment: segment => wolfAttackClip(segment),
    }),
    /* 无护甲 / 肢体槽；口部持械（短剑 / 长剑） */
    equipSlots: {armor: [], limb: [], weapon: true},
    weapons: WOLF_WEAPONS,
    defaultWeaponId: 'wolf_bite',
    editor: {weaponControl: true, handedness: false},
    /* 四足：翻滚改为低伏冲刺，不做前滚翻 */
    rollSpinTurns: 0,
}
