import type {Group} from 'three'
import type {BodyAppearance, BodyForm, ColliderSpec} from '../../body_form/types.ts'
import {createCreatureAnimationSystem} from '../creature_runtime/animation.ts'
import {createCreatureAppearance, createCreatureModel} from '../creature_runtime/model.ts'
import {wyvernAttackClip, wyvernBaseClip} from './clips.ts'
import {WYVERN_HURT_BLOCKS, WYVERN_PARTS} from './parts.ts'
import {buildWyvernSkeleton} from './skeleton.ts'
import {WYVERN_BREATH_MODULES} from './breath.ts'
import {WYVERN_WEAPONS} from './weapons.ts'

export const WYVERN_BODY_FORM_ID = 'wyvern'

/**
 * wyvern 碰撞布局（胶囊 + 盒，尽量贴合双足飞龙轮廓）：
 * - 主碰撞体：**竖直胶囊**（脚底→背），保证站立高度（地面 / 分离主引用）；
 * - 躯干盒：覆盖宽矮胸躯（高度约 1.0，不触地）。
 * 双翼与尾部不参与物理（尾部仅受击块覆盖）。
 */
const WYVERN_COLLIDER_LAYOUT: readonly ColliderSpec[] = [
    {nodeId: 'bodyCollider', kind: 'capsule', radius: 0.3, halfHeight: 0.7, offsetY: 0},
    {nodeId: 'torsoCollider', kind: 'box', half: {x: 0.42, y: 0.3, z: 0.55}, offsetY: 0},
]

/**
 * 双足飞龙（wyvern，双足 + 双翼，共 4 肢）体形计划。
 * 主武器固定为 `wyvern_claw`（五段爪击）；重击来自独立 `breath` 装备槽（火球/雷电/激光）。
 * **注意**：本计划是 wyvern，不是六肢（四足双翼）的 dragon。
 */
export const WYVERN_BODY_FORM: BodyForm = {
    id: WYVERN_BODY_FORM_ID,
    nameKey: 'body_form.wyvern',
    buildSkeleton: buildWyvernSkeleton,
    colliderLayout: WYVERN_COLLIDER_LAYOUT,
    centerOffsetY: 1.0,
    /* 飞龙眼高：S 形颈抬头，头位高于躯干中心 */
    eyeHeight: 1.5,
    size: {width: 1.0, height: 2.0, depth: 1.6},
    baseHealth: 18,
    hurtProfile: WYVERN_HURT_BLOCKS,
    assemble: (groups: ReadonlyMap<string, Group>): BodyAppearance =>
        createCreatureAppearance(groups, WYVERN_PARTS, WYVERN_COLLIDER_LAYOUT),
    createModel: (config) => createCreatureModel({
        skeleton: buildWyvernSkeleton(),
        parts: WYVERN_PARTS,
        mainMountId: 'mouthMount',
        colliderLayout: WYVERN_COLLIDER_LAYOUT,
        scale: config.scale,
    }),
    createAnimation: createCreatureAnimationSystem({
        clipForState: state => wyvernBaseClip(state),
        clipForSegment: segment => wyvernAttackClip(segment),
    }),
    equipSlots: {armor: [], limb: [], weapon: true, breath: true},
    weapons: WYVERN_WEAPONS,
    defaultWeaponId: 'wyvern_claw',
    breathModules: WYVERN_BREATH_MODULES,
}
