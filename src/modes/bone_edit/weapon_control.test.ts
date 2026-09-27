import {describe, it, expect} from 'vitest'
import {Group, Vector3} from 'three'
import {isTwoHandedWeapon, resolveAutoWeapon, weaponSpecOf} from './weapon_control.ts'
import {computeTwoHandGripTarget, leftGripJointId} from '../../entity/character/appearance/two_handed_ik.ts'
import {TWO_HAND_GRIP_OFFSET} from '../../entity/character/appearance/constants.ts'
import {DEFAULT_WEAPON_ID, findWeaponPreset} from '../../character/weapon/catalog.ts'
import {skeletonFromDefinition} from '../../skeleton/anim/serialization.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/character/skeleton/preset.ts'
import {LEFT_WEAPON_MOUNT_JOINT, RIGHT_WEAPON_MOUNT_JOINT} from './weapon_equip.ts'

describe('编辑器武器规格（weaponSpecOf / isTwoHandedWeapon）', () => {
    it('双手判定按显式持握模式，缺省取武器默认模式（近战默认单持）', () => {
        const shortSword = findWeaponPreset('short_sword')!
        const heavySword = findWeaponPreset('heavy_sword')!
        const spear = findWeaponPreset('spear')!
        const longbow = findWeaponPreset('longbow')!
        expect(isTwoHandedWeapon(shortSword)).toBe(false)
        /* 近战默认单持：不显式给模式时不是双手 */
        expect(isTwoHandedWeapon(heavySword)).toBe(false)
        expect(isTwoHandedWeapon(heavySword, 'two_handed')).toBe(true)
        expect(isTwoHandedWeapon(spear, 'two_handed')).toBe(true)
        /* 远程默认即双手 */
        expect(isTwoHandedWeapon(longbow)).toBe(true)
    })

    it('武器规格含网格与双手标记；双持模式附带同类副手网格；未知武器 id 返回 undefined', () => {
        const spec = weaponSpecOf('heavy_sword', 'two_handed')!
        expect(spec.weaponId).toBe('heavy_sword')
        expect(spec.meshConfig.id).toBe('heavy_sword')
        expect(spec.twoHanded).toBe(true)
        expect(spec.offhandMeshConfig).toBeUndefined()

        const dual = weaponSpecOf('long_sword', 'dual_wield')!
        expect(dual.twoHanded).toBe(false)
        expect(dual.offhandMeshConfig).toMatchObject({id: 'sword'})

        expect(weaponSpecOf('nope')).toBeUndefined()
    })

    it('「自动」模式解析：攻击动作 → 该武器（带段所属持握模式）；空手变体 → 卸下；无来源 → 保留当前，无当前则默认武器', () => {
        /* 攻击动作（含内置副本）→ 该武器 + 段所属持握模式 */
        const spearSpec = resolveAutoWeapon({weaponId: 'spear', segmentId: 'spear_two_handed_light_1', holdMode: 'two_handed'}, undefined)
        expect(spearSpec?.weaponId).toBe('spear')
        expect(spearSpec?.twoHanded).toBe(true)
        /* 空手变体 → 卸下武器 */
        expect(resolveAutoWeapon({weaponHeld: false}, weaponSpecOf('heavy_sword'))).toBeUndefined()
        /* 持械变体 / 无来源动画（自定义动画、跳跃等）→ 保留当前武器 */
        expect(resolveAutoWeapon({weaponHeld: true}, weaponSpecOf('heavy_sword'))?.weaponId).toBe('heavy_sword')
        expect(resolveAutoWeapon({}, weaponSpecOf('short_sword'))?.weaponId).toBe('short_sword')
        /* 进入编辑器尚无当前武器 → 默认武器（避免「武器没出来」） */
        expect(resolveAutoWeapon({}, undefined)?.weaponId).toBe(DEFAULT_WEAPON_ID)
    })
})

describe('副握点（computeTwoHandGripTarget）与左手链末端（leftGripJointId）', () => {
    it('副握点 = 武器挂点沿武器轴（本地 +Y）偏移 TWO_HAND_GRIP_OFFSET', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        const mount = new Group()
        mount.position.set(1, 2, 3)
        mount.updateMatrixWorld(true)
        const out = new Vector3()
        expect(computeTwoHandGripTarget(skeleton, mount, TWO_HAND_GRIP_OFFSET, out)!.toArray()).toEqual([1, 2 + TWO_HAND_GRIP_OFFSET, 3])

        /* 挂点绕 Z 轴旋转 90°：本地 +Y 指向世界 -X */
        mount.rotation.set(0, 0, Math.PI / 2)
        mount.updateMatrixWorld(true)
        const rotated = computeTwoHandGripTarget(skeleton, mount, TWO_HAND_GRIP_OFFSET, out)!.toArray()
        expect(rotated[0]).toBeCloseTo(1 - TWO_HAND_GRIP_OFFSET, 6)
        expect(rotated[1]).toBeCloseTo(2, 6)
    })

    it('预设骨架 → 左手链末端取左手武器挂点', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        expect(skeleton.findJoint(RIGHT_WEAPON_MOUNT_JOINT)).toBeDefined()
        expect(leftGripJointId(skeleton)).toBe(LEFT_WEAPON_MOUNT_JOINT)
    })

    it('缺少武器挂点的自定义骨架 → 回退左腕', () => {
        const definition = buildCharacterSkeletonDefinition()
        const stripped = {
            joints: definition.joints.filter(joint => joint.id !== LEFT_WEAPON_MOUNT_JOINT && joint.id !== RIGHT_WEAPON_MOUNT_JOINT),
            bones: definition.bones,
        }
        const skeleton = skeletonFromDefinition(stripped)
        expect(leftGripJointId(skeleton)).toBe('leftWristPivot')
    })
})
