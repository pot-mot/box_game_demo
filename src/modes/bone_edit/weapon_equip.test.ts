import {describe, it, expect} from 'vitest'
import {Box3, Scene, Vector3} from 'three'
import {equipSkeletonWeapon} from './weapon_equip.ts'
import {weaponSpecOf} from './weapon_control.ts'
import {createJointVisuals} from '../../entity/skeleton/render/joint_groups.ts'
import {skeletonFromDefinition} from '../../skeleton/anim/serialization.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/character/skeleton/preset.ts'

/** 编辑器武器装载（真实场景图 + 预设骨架）：保证武器「挂得上、看得见、跟得动」 */
describe('编辑器武器装载（equipSkeletonWeapon）', () => {
    const setup = (): ReturnType<typeof createJointVisuals> => {
        const scene = new Scene()
        return createJointVisuals(skeletonFromDefinition(buildCharacterSkeletonDefinition()), scene)
    }

    it('武器挂到右手武器挂点关节下（世界位置落在右腕，且有真实几何）', () => {
        const visuals = setup()
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('long_sword')!)
        expect(weapon).toBeDefined()
        const mountGroup = visuals.groups.get('rightWeaponMount')!
        expect(weapon!.weaponGroup.parent).toBe(mountGroup)

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
        expect(box.getSize(new Vector3()).length()).toBeGreaterThan(0.1)

        weapon!.dispose()
        /* 卸下后从场景图移除（武器骨骼关节自身的小球仍在） */
        expect(weapon!.weaponGroup.parent).toBeNull()
        expect(mountGroup.children).not.toContain(weapon!.weaponGroup)
        visuals.cleanup()
    })

    it('双手武器的副握点按武器类型与模型比例和主手拉开距离', () => {
        const visuals = setup()
        const cases = ['heavy_sword', 'spear', 'war_hammer', 'longbow', 'crossbow', 'shotgun', 'staff'] as const
        for (const weaponId of cases) {
            const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf(weaponId)!)!
            const supportGrip = weapon.weaponGroup.localToWorld(new Vector3(0, weapon.supportGripOffset, 0))
            const mainGrip = weapon.weaponGroup.getWorldPosition(new Vector3())
            expect(supportGrip.distanceTo(mainGrip), `${weaponId} 双手握点未拉开`).toBeGreaterThan(0.06)
            expect(supportGrip.distanceTo(mainGrip), `${weaponId} 双手握点超出合理握距`).toBeLessThan(0.4)
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

    it('双持：副手武器挂到左手武器挂点（有真实几何），dispose 一并卸载', () => {
        const visuals = setup()
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('dual_axe')!)!
        expect(weapon.offhand).toBeDefined()
        expect(weapon.offhand!.weaponGroup.parent).toBe(visuals.groups.get('leftWeaponMount'))
        const box = new Box3().setFromObject(weapon.offhand!.weaponGroup)
        expect(box.isEmpty()).toBe(false)
        expect(box.getSize(new Vector3()).length()).toBeGreaterThan(0.1)

        weapon.dispose()
        expect(weapon.weaponGroup.parent).toBeNull()
        expect(weapon.offhand!.weaponGroup.parent).toBeNull()
        visuals.cleanup()
    })

    it('缺少武器挂点的骨架回退到右腕关节（自定义骨架兼容）', () => {
        const definition = buildCharacterSkeletonDefinition()
        const stripped = {
            joints: definition.joints.filter(joint => joint.id !== 'rightWeaponMount'),
            bones: definition.bones,
        }
        const scene = new Scene()
        const visuals = createJointVisuals(skeletonFromDefinition(stripped), scene)
        const weapon = equipSkeletonWeapon(visuals.groups, weaponSpecOf('short_sword')!)
        expect(weapon!.weaponGroup.parent).toBe(visuals.groups.get('rightWristPivot'))
        weapon!.dispose()
        visuals.cleanup()
    })
})
