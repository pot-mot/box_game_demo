import {describe, it, expect} from 'vitest'
import {Group, Quaternion, Vector3} from 'three'
import {createSkeletonFromGroups} from './bridge.ts'
import {createSkeletonJoint, connectJoint} from '../../../skeleton/joint.ts'
import {createSkeletonBone, rotateBone} from '../../../skeleton/bone.ts'
import {createSkeleton} from '../../../skeleton/skeleton.ts'

/** 构建三关节 Group 层级：root → mid → tip */
const buildGroups = (): {root: Group; mid: Group; tip: Group; scene: Group} => {
    const scene = new Group()
    const root = new Group()
    const mid = new Group()
    const tip = new Group()
    root.add(mid)
    mid.add(tip)
    scene.add(root)
    return {root, mid, tip, scene}
}

describe('场景真源桥接（createSkeletonFromGroups）', () => {
    it('绑定自动创建同名关节并注册', () => {
        const {root, mid, tip} = buildGroups()
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        expect(bridge.joints.size).toBe(3)
        expect(bridge.findJoint('mid')).toBeDefined()
    })

    it('重复绑定 id 抛错', () => {
        const {root} = buildGroups()
        expect(() => createSkeletonFromGroups([
            {jointId: 'a', group: root},
            {jointId: 'a', group: root},
        ])).toThrow()
    })

    it('初始化：Group 的局部 pose 读入骨架（场景为真源）', () => {
        const {root, mid, tip} = buildGroups()
        mid.position.set(0, 2, 0)
        tip.position.set(1, 0, 0)
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        expect(bridge.findJoint('mid')!.position.y).toBe(2)
        expect(bridge.findJoint('tip')!.position.x).toBe(1)
    })

    it('领域局部修改 → updateWorldTransforms 写回 Group（场景图级联生效）', () => {
        const {root, mid, tip, scene} = buildGroups()
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        bridge.findJoint('mid')!.position.set(0, 3, 0)
        bridge.updateWorldTransforms()
        expect(mid.position.y).toBe(3)
        scene.updateMatrixWorld(true)
        expect(tip.getWorldPosition(new Vector3()).y).toBe(3)
    })

    it('applyPose 写局部并同步 Group（非根关节；根位移由外部管理不被覆盖）', () => {
        const {root, mid, tip} = buildGroups()
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        connectJoint(bridge.findJoint('root')!, bridge.findJoint('mid')!)
        connectJoint(bridge.findJoint('mid')!, bridge.findJoint('tip')!)
        const pose = bridge.readPose()
        /* 根位置先由外部设定，pose 尝试清零根位移 —— 应被保留 */
        bridge.findJoint('root')!.position.set(5, 0, 3)
        pose.jointPoses.get('root')!.position.set(0, 0, 0)
        pose.jointPoses.get('tip')!.position.set(0, 4, 0)
        bridge.applyPose(pose)
        /* 根位置不被动画覆盖 */
        expect(root.position.x).toBe(5)
        expect(root.position.z).toBe(3)
        /* 非根关节照常写入并同步 Group */
        expect(tip.position.y).toBe(4)
    })

    it('rotateBone 经桥接生效（tail 子树旋转并写回 Group）', () => {
        const {root, mid, tip, scene} = buildGroups()
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        connectJoint(bridge.findJoint('root')!, bridge.findJoint('mid')!)
        connectJoint(bridge.findJoint('mid')!, bridge.findJoint('tip')!)
        bridge.findJoint('mid')!.position.set(0, 2, 0)
        bridge.findJoint('tip')!.position.set(1, 0, 0)
        bridge.updateWorldTransforms()
        bridge.addBone(createSkeletonBone('b', bridge.findJoint('mid')!, bridge.findJoint('tip')!, 1, 'b'))

        rotateBone(bridge, bridge.findBone('b')!, new Vector3(0, 1, 0), Math.PI / 2)
        scene.updateMatrixWorld(true)
        const tipWorld = tip.getWorldPosition(new Vector3())
        expect(tipWorld.x).toBeCloseTo(0)
        expect(tipWorld.z).toBeCloseTo(-1)
        expect(tipWorld.y).toBeCloseTo(2)
    })

    it('syncFromScene：外部直接修改 Group 后读回骨架', () => {
        const {root, mid, tip} = buildGroups()
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        const tipQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.2)
        mid.position.set(0, 7, 0)
        tip.quaternion.copy(tipQuat)
        bridge.syncFromScene()
        expect(bridge.findJoint('mid')!.position.y).toBe(7)
        expect(bridge.findJoint('tip')!.rotation.angleTo(tipQuat)).toBeLessThan(1e-6)
    })

    it('世界变换与普通骨架一致（FK 结果）', () => {
        const {root, mid, tip} = buildGroups()
        const bridge = createSkeletonFromGroups([
            {jointId: 'root', group: root},
            {jointId: 'mid', group: mid},
            {jointId: 'tip', group: tip},
        ])
        connectJoint(bridge.findJoint('root')!, bridge.findJoint('mid')!)
        connectJoint(bridge.findJoint('mid')!, bridge.findJoint('tip')!)
        bridge.findJoint('mid')!.position.set(0, 2, 0)
        bridge.findJoint('tip')!.position.set(1, 0, 0)
        bridge.updateWorldTransforms()

        const plain = createSkeleton()
        const r = createSkeletonJoint('root', 'root')
        const m = createSkeletonJoint('mid', 'mid')
        const t = createSkeletonJoint('tip', 'tip')
        connectJoint(r, m)
        connectJoint(m, t)
        m.position.set(0, 2, 0)
        t.position.set(1, 0, 0)
        plain.addJoint(r)
        plain.addJoint(m)
        plain.addJoint(t)
        plain.updateWorldTransforms()

        expect(bridge.getWorldPosition('tip')!.distanceTo(plain.getWorldPosition('tip')!)).toBeLessThan(1e-6)
    })
})