import {describe, it, expect} from 'vitest'
import {Scene, Vector3} from 'three'
import {createBoneEditWeaponControl} from './weapon_control.ts'
import {createJointVisuals} from '../../entity/skeleton/render/joint_groups.ts'
import {skeletonFromDefinition} from '../../skeleton/anim/serialization.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/skeleton/preset.ts'
import type {SkeletonEntitiesContext, SkeletonEntity} from '../../entity/skeleton/world.ts'
import type {Mesh} from 'three'

/**
 * 「拖武器不牵扯另一只手」回归：
 * 编辑（暂停）状态下武器装载与切换都不做任何跨手干预；
 * 左手贴合只在开关打开 + 播放预览（solveGrip 显式调用）时生效。
 */
describe('编辑器武器与手的独立性', () => {
    const makeEntity = (scene: Scene): SkeletonEntity => {
        const visuals = createJointVisuals(skeletonFromDefinition(buildCharacterSkeletonDefinition()), scene)
        return {
            id: 1,
            name: '骨架1',
            skeleton: visuals.bridge,
            visuals,
            appearance: {boneParts: new Map(), partMeshes: [], cleanup: () => {}},
            meshes: [] as readonly Mesh[],
        }
    }

    /** 只满足武器控制所需字段的最小上下文（聚焦骨架 + visuals.groups + skeleton） */
    const makeWorld = (entity: SkeletonEntity): SkeletonEntitiesContext =>
        ({getFocus: () => entity} as unknown as SkeletonEntitiesContext)

    const leftHandPositions = (entity: SkeletonEntity): readonly Vector3[] => [
        entity.skeleton.getWorldPosition('leftArmElbow')!.clone(),
        entity.skeleton.getWorldPosition('leftHandPivot')!.clone(),
    ]

    it('装载/切换武器不改变左手（编辑态零耦合）', () => {
        const scene = new Scene()
        const entity = makeEntity(scene)
        const control = createBoneEditWeaponControl(makeWorld(entity))

        /* 进入即装备默认武器（长剑，单手） */
        control.syncForClip({})
        expect(control.currentWeaponId()).toBe('long_sword')
        const before = leftHandPositions(entity)

        /* 换双手武器（战锤）→ 只换了手部武器，不触碰左臂 */
        control.syncForClip({weaponId: 'war_hammer'})
        expect(control.currentWeaponId()).toBe('war_hammer')
        expect(control.isTwoHanded()).toBe(true)
        for (const [i, pos] of leftHandPositions(entity).entries()) {
            expect(pos.distanceTo(before[i])).toBeLessThan(1e-9)
        }
        /* 未显式求解 → 未贴合，左手 IK 根保持未设置（不会牵扯左手） */
        expect(control.isGripSolved()).toBe(false)
        expect(entity.skeleton.findJoint('leftArmShoulder')!.ikRootLevel).toBeUndefined()

        control.dispose()
        entity.visuals.cleanup()
    })

    it('右手（武器挂点）单独移动时左手不变；贴合并求解时才把左手拉到武器上', () => {
        const scene = new Scene()
        const entity = makeEntity(scene)
        const control = createBoneEditWeaponControl(makeWorld(entity))
        control.syncForClip({weaponId: 'war_hammer'})
        control.solveGrip()  /* 开关默认关 → 应为无操作 */
        const leftBefore = leftHandPositions(entity)

        /* 模拟「拖右手抬臂」：只改右臂关节，左臂必须纹丝不动 */
        entity.skeleton.findJoint('rightArmShoulder')!.rotation.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 3)
        entity.skeleton.updateWorldTransforms()
        for (const [i, pos] of leftHandPositions(entity).entries()) {
            expect(pos.distanceTo(leftBefore[i])).toBeLessThan(1e-9)
        }

        /* 打开贴合 + 播放预览求解 → 左手被拉到武器副握点附近（此时才允许牵扯） */
        control.setGripAssist(true)
        control.solveGrip()
        expect(control.isGripSolved()).toBe(true)
        const leftHand = entity.skeleton.getWorldPosition('leftHandPivot')!
        const grip = entity.skeleton.getWorldPosition('leftWeaponMount')!
        expect(leftHand.distanceTo(grip)).toBeLessThan(0.2)
        /* 贴合期间左肩被标记为 IK 根（链只到左肩，不会波及躯干/右臂） */
        expect(entity.skeleton.findJoint('leftArmShoulder')!.ikRootLevel).toBe(0)

        /* 关闭贴合：立即解除 IK 根，右手再动左手不受影响 */
        control.setGripAssist(false)
        expect(entity.skeleton.findJoint('leftArmShoulder')!.ikRootLevel).toBeUndefined()
        const leftAfterOff = leftHandPositions(entity)
        entity.skeleton.findJoint('rightArmShoulder')!.rotation.setFromAxisAngle(new Vector3(1, 0, 0), 0)
        entity.skeleton.updateWorldTransforms()
        for (const [i, pos] of leftHandPositions(entity).entries()) {
            expect(pos.distanceTo(leftAfterOff[i])).toBeLessThan(1e-9)
        }

        control.dispose()
        entity.visuals.cleanup()
    })
})
