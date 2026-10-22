import {describe, it, expect} from 'vitest'
import {Box3, Group, Scene, Vector3} from 'three'
import {equipSkeletonWeapon, LEFT_WEAPON_MOUNT_JOINT, RIGHT_WEAPON_MOUNT_JOINT} from './weapon_equip.ts'
import {weaponSpecOf} from './weapon_control.ts'
import {createJointVisuals} from '../../entity/skeleton/render/joint_groups.ts'
import {skeletonFromDefinition} from '../../skeleton/anim/serialization.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/character/forms/humanoid/skeleton.ts'
import {weaponsOfForm} from '../../character/weapon/catalog.ts'
import {HUMANOID_BODY_FORM_ID} from '../../entity/character/body_form/index.ts'

const SUPPORT_GRIP_MIN = 0.06
const SUPPORT_GRIP_MAX = 0.4
const TWO_HANDED_WEAPON_IDS = weaponsOfForm(HUMANOID_BODY_FORM_ID)
    .filter(weapon => weapon.holdModes.includes('two_handed') && (weapon.mesh.supportGripOffset ?? 0) !== 0)
    .map(weapon => weapon.id)

/** 编辑器武器装载（真实场景图 + 预设骨架）：保证武器「挂得上、看得见、跟得动」，并按惯用手选挂点 / 镜像 */
describe('编辑器武器装载（equipSkeletonWeapon）', () => {
    const setup = (): ReturnType<typeof createJointVisuals> => {
        const scene = new Scene()
        return createJointVisuals(skeletonFromDefinition(buildCharacterSkeletonDefinition()), scene)
    }

    it('武器挂到右手武器挂点关节下（世界位置落在右腕，且有真实几何）', () => {
        const visuals = setup()
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('long_sword')!)
        expect(weapon).toBeDefined()
        const mountGroup = visuals.groups.get(RIGHT_WEAPON_MOUNT_JOINT)!
        expect(weapon!.weaponGroup.parent).toBe(mountGroup)
        expect(weapon!.weaponGroup.scale.x).toBe(1)

        mountGroup.updateMatrixWorld(true)
        /* 武器模型原点按其真实握把坐标校正后落在右腕节点 */
        const gripCenterWorld = weapon!.weaponGroup.localToWorld(
            new Vector3(weapon!.gripX, weapon!.gripY, weapon!.gripZ),
        )
        const wristWorld = visuals.groups.get('rightWristPivot')!.getWorldPosition(new Vector3())
        expect(gripCenterWorld.distanceTo(wristWorld)).toBeLessThan(1e-6)
        expect(wristWorld.length()).toBeGreaterThan(0)
        expect(weapon!.weaponGroup.getWorldPosition(new Vector3()).length()).toBeGreaterThan(0)
        /* 武器自身朝向 = 固有握持姿态（rx/ry/rz 非零则武器有前倾/刃面偏转） */
        expect(weapon!.weaponGroup.quaternion.angleTo(visuals.groups.get('rightWristPivot')!.quaternion)).toBeGreaterThan(0)

        /* 武器网格有真实几何（可见性回归：空包围盒 = 看不见） */
        const box = new Box3().setFromObject(weapon!.weaponGroup)
        expect(box.isEmpty()).toBe(false)

        weapon!.dispose()
        /* 卸下后从场景图移除（武器骨骼关节自身的小球仍在） */
        expect(weapon!.weaponGroup.parent).toBeNull()
        expect(mountGroup.children).not.toContain(weapon!.weaponGroup)
        visuals.cleanup()
    })

    it('左撇子：挂左手武器挂点、网格沿矢状面镜像、世界位置落在左腕（有真实几何）', () => {
        const visuals = setup()
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('long_sword')!, 'left')!
        const mountGroup = visuals.groups.get(LEFT_WEAPON_MOUNT_JOINT)!
        expect(weapon.weaponGroup.parent).toBe(mountGroup)
        expect(weapon.weaponGroup.scale.x).toBe(-1)

        mountGroup.updateMatrixWorld(true)
        const gripCenterWorld = weapon.weaponGroup.localToWorld(
            new Vector3(weapon.gripX, weapon.gripY, weapon.gripZ),
        )
        const wristWorld = visuals.groups.get('leftWristPivot')!.getWorldPosition(new Vector3())
        expect(gripCenterWorld.distanceTo(wristWorld)).toBeLessThan(1e-6)

        const box = new Box3().setFromObject(weapon.weaponGroup)
        expect(box.isEmpty()).toBe(false)

        weapon.dispose()
        expect(weapon.weaponGroup.parent).toBeNull()
        visuals.cleanup()
    })

    it('双手武器的副握点按武器类型与模型比例和主手拉开距离', () => {
        const visuals = setup()
        for (const weaponId of TWO_HANDED_WEAPON_IDS) {
            const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf(weaponId)!)!
            const supportGrip = weapon.weaponGroup.localToWorld(new Vector3(0, weapon.supportGripOffset, 0))
            const mainGrip = weapon.weaponGroup.getWorldPosition(new Vector3())
            expect(supportGrip.distanceTo(mainGrip), `${weaponId} 双手握点未拉开`).toBeGreaterThan(SUPPORT_GRIP_MIN)
            expect(supportGrip.distanceTo(mainGrip), `${weaponId} 双手握点超出合理握距`).toBeLessThan(SUPPORT_GRIP_MAX)
            weapon.dispose()
        }
        visuals.cleanup()
    })

    it('武器随骨架姿态移动（右手前摆后武器世界位置改变）', () => {
        const visuals = setup()
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('long_sword')!)!
        visuals.bridge.updateWorldTransforms()
        const before = weapon.weaponGroup.getWorldPosition(new Vector3())

        const shoulder = visuals.bridge.findJoint('rightArmShoulder')!
        shoulder.rotation.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 3)
        visuals.bridge.updateWorldTransforms()
        const after = weapon.weaponGroup.getWorldPosition(new Vector3())
        expect(after.distanceTo(before)).toBeGreaterThan(0.05)

        weapon.dispose()
        visuals.cleanup()
    })

    it('双持：副手武器挂到左手武器挂点（有真实几何），dispose 一并卸载；左撇子主/副挂点互换并同时镜像', () => {
        const visuals = setup()
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('dual_axe', 'dual_wield')!)!
        expect(weapon.offhand).toBeDefined()
        expect(weapon.weaponGroup.parent).toBe(visuals.groups.get(RIGHT_WEAPON_MOUNT_JOINT))
        expect(weapon.offhand!.weaponGroup.parent).toBe(visuals.groups.get(LEFT_WEAPON_MOUNT_JOINT))
        const box = new Box3().setFromObject(weapon.offhand!.weaponGroup)
        expect(box.isEmpty()).toBe(false)

        weapon.dispose()
        expect(weapon.weaponGroup.parent).toBeNull()
        expect(weapon.offhand!.weaponGroup.parent).toBeNull()
        visuals.cleanup()

        /* 左撇子：主手挂左挂点、副手挂右挂点，两侧网格均镜像 */
        const visualsLeft = setup()
        const left = equipSkeletonWeapon(visualsLeft.groups, weaponSpecOf('dual_axe', 'dual_wield')!, 'left')!
        expect(left.weaponGroup.parent).toBe(visualsLeft.groups.get(LEFT_WEAPON_MOUNT_JOINT))
        expect(left.weaponGroup.scale.x).toBe(-1)
        expect(left.offhand!.weaponGroup.parent).toBe(visualsLeft.groups.get(RIGHT_WEAPON_MOUNT_JOINT))
        expect(left.offhand!.weaponGroup.scale.x).toBe(-1)
        left.dispose()
        visualsLeft.cleanup()
    })

    it('缺少武器挂点的骨架回退到同侧腕关节（自定义骨架兼容）', () => {
        const definition = buildCharacterSkeletonDefinition()
        const stripped = {
            joints: definition.joints.filter(joint => joint.id !== RIGHT_WEAPON_MOUNT_JOINT),
            bones: definition.bones,
        }
        const scene = new Scene()
        const visuals = createJointVisuals(skeletonFromDefinition(stripped), scene)
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('short_sword')!)
        expect(weapon!.weaponGroup.parent).toBe(visuals.groups.get('rightWristPivot'))
        weapon!.dispose()
        visuals.cleanup()
    })

    it('缺挂点且该侧无腕关节：返回 undefined（左撇子自定义骨架）', () => {
        const spec = weaponSpecOf('long_sword')!
        const rightWristOnly = new Map<string, Group>([['rightWristPivot', new Group()]])
        /* 右撇子：主手侧有腕 → 回退到右腕 */
        expect(equipSkeletonWeapon(rightWristOnly, spec, 'right')!.weaponGroup.parent).toBe(rightWristOnly.get('rightWristPivot'))
        /* 左撇子：主手侧（左）既无挂点也无腕 → undefined */
        expect(equipSkeletonWeapon(rightWristOnly, spec, 'left')).toBeUndefined()
    })
})
