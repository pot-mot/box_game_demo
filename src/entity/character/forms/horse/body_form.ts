import type {Group} from 'three'
import type {BodyAppearance, BodyForm, ColliderSpec} from '../../body_form/types.ts'
import {createCreatureAnimationSystem} from '../creature_runtime/animation.ts'
import {createCreatureAppearance, createCreatureModel} from '../creature_runtime/model.ts'
import {horseAttackClip, horseBaseClip} from './clips.ts'
import {HORSE_HURT_BLOCKS, HORSE_PARTS} from './parts.ts'
import {buildHorseSkeleton} from './skeleton.ts'
import {HORSE_WEAPONS} from './weapons.ts'

export const HORSE_BODY_FORM_ID = 'horse'

/**
 * 马碰撞布局（胶囊 + 盒，尽量贴合高腿长颈轮廓）：
 * - 主碰撞体：**竖直胶囊**（脚底→背），保证站立高度（地面 / 分离主引用）；
 * - 桶状躯干横胶囊（节点带 90° X 旋转）：覆盖前后体长；
 * - 头颈盒：覆盖前伸的长颈 / 头。
 */
const HORSE_COLLIDER_LAYOUT: readonly ColliderSpec[] = [
    {nodeId: 'bodyCollider', kind: 'capsule', radius: 0.3, halfHeight: 0.65, offsetY: 0},
    {nodeId: 'torsoCollider', kind: 'capsule', radius: 0.3, halfHeight: 0.35, offsetY: 0},
    {nodeId: 'headCollider', kind: 'box', half: {x: 0.18, y: 0.26, z: 0.3}, offsetY: 0},
]

/**
 * 马（四足）体形计划：自带骨架 / 外观 / 动画系统 / 受击子块 / 碰撞布局。
 * 天然武器 `horse_iron_hoof`（铁蹄，melee）为 default；无其他武器。
 */
export const HORSE_BODY_FORM: BodyForm = {
    id: HORSE_BODY_FORM_ID,
    nameKey: 'body_form.horse',
    buildSkeleton: buildHorseSkeleton,
    colliderLayout: HORSE_COLLIDER_LAYOUT,
    centerOffsetY: 0.95,
    /* 马眼高：长颈抬头，头位远高于躯干中心 */
    eyeHeight: 1.35,
    size: {width: 0.7, height: 1.9, depth: 1.9},
    baseHealth: 16,
    hurtProfile: HORSE_HURT_BLOCKS,
    assemble: (groups: ReadonlyMap<string, Group>): BodyAppearance =>
        createCreatureAppearance(groups, HORSE_PARTS, HORSE_COLLIDER_LAYOUT),
    createModel: (config) => createCreatureModel({
        skeleton: buildHorseSkeleton(),
        parts: HORSE_PARTS,
        mainMountId: 'mouthMount',
        colliderLayout: HORSE_COLLIDER_LAYOUT,
        scale: config.scale,
    }),
    createAnimation: createCreatureAnimationSystem({
        clipForState: state => horseBaseClip(state),
        clipForSegment: segment => horseAttackClip(segment),
    }),
    equipSlots: {armor: [], limb: [], weapon: true},
    weapons: HORSE_WEAPONS,
    defaultWeaponId: 'horse_iron_hoof',
    /* 四足：翻滚改为低伏冲刺，不做前滚翻 */
    rollSpinTurns: 0,
}
