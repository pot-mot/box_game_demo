import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {createSkeleton} from './skeleton.ts'
import {createSkeletonJoint, connectJoint} from './joint.ts'
import {createSkeletonBone} from './bone.ts'

/** 构建两层链：root → mid → tip，mid 局部 +Y 偏移，tip 局部 +X 偏移 */
const buildChain = (): ReturnType<typeof createSkeleton> => {
    const skeleton = createSkeleton()
    const root = createSkeletonJoint('root', 'root')
    const mid = createSkeletonJoint('mid', 'mid')
    const tip = createSkeletonJoint('tip', 'tip')
    connectJoint(root, mid)
    connectJoint(mid, tip)
    mid.position.set(0, 2, 0)
    tip.position.set(1, 0, 0)
    skeleton.addJoint(root)
    skeleton.addJoint(mid)
    skeleton.addJoint(tip)
    return skeleton
}

describe('骨架 FK 级联', () => {
    it('多层链世界位置 = 父链合成（先旋后移）', () => {
        const skeleton = buildChain()
        skeleton.updateWorldTransforms()
        expect(skeleton.getWorldPosition('mid')!.y).toBeCloseTo(2)
        expect(skeleton.getWorldPosition('tip')!.x).toBeCloseTo(1)
        expect(skeleton.getWorldPosition('tip')!.y).toBeCloseTo(2)
    })

    it('父关节旋转带动子链世界位置', () => {
        const skeleton = buildChain()
        skeleton.findJoint('mid')!.rotation.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
        skeleton.updateWorldTransforms()
        /* rotY(90°)：tip 局部 +X 转到 −Z */
        const tipPos = skeleton.getWorldPosition('tip')!
        expect(tipPos.x).toBeCloseTo(0)
        expect(tipPos.z).toBeCloseTo(-1)
        expect(tipPos.y).toBeCloseTo(2)
    })

    it('未重算世界变换时返回 undefined', () => {
        const skeleton = createSkeleton()
        skeleton.addJoint(createSkeletonJoint('a', 'a'))
        expect(skeleton.getWorldPosition('a')).toBeUndefined()
        expect(skeleton.getWorldRotation('a')).toBeUndefined()
    })

    it('多根骨架各自独立级联', () => {
        const skeleton = createSkeleton()
        const a = createSkeletonJoint('a', 'a')
        const a1 = createSkeletonJoint('a1', 'a1')
        const b = createSkeletonJoint('b', 'b')
        connectJoint(a, a1)
        a.position.set(1, 0, 0)
        a1.position.set(0, 3, 0)
        b.position.set(-5, 0, 0)
        skeleton.addJoint(a)
        skeleton.addJoint(a1)
        skeleton.addJoint(b)
        skeleton.updateWorldTransforms()
        expect(skeleton.getWorldPosition('a1')!.x).toBeCloseTo(1)
        expect(skeleton.getWorldPosition('a1')!.y).toBeCloseTo(3)
        expect(skeleton.getWorldPosition('b')!.x).toBeCloseTo(-5)
        expect(skeleton.getRoots()).toHaveLength(2)
    })
})

describe('骨架 addBone / removeBone', () => {
    it('addBone：head 必须是 tail 的祖先', () => {
        const skeleton = createSkeleton()
        const a = createSkeletonJoint('a', 'a')
        const b = createSkeletonJoint('b', 'b')
        const c = createSkeletonJoint('c', 'c')
        connectJoint(a, b)
        connectJoint(c, b)
        skeleton.addJoint(a)
        skeleton.addJoint(b)
        skeleton.addJoint(c)
        expect(() => skeleton.addBone(createSkeletonBone('x', a, c, 1, 'x'))).toThrow()
        expect(() => skeleton.addBone(createSkeletonBone('y', c, a, 1, 'y'))).toThrow()
    })

    it('addBone：关节必须已注册', () => {
        const skeleton = createSkeleton()
        const a = createSkeletonJoint('a', 'a')
        const b = createSkeletonJoint('b', 'b')
        connectJoint(a, b)
        skeleton.addJoint(a)
        expect(() => skeleton.addBone(createSkeletonBone('x', a, b, 1, 'x'))).toThrow()
    })

    it('addBone：length <= 0 时按两端世界距离自动取值', () => {
        const skeleton = createSkeleton()
        const a = createSkeletonJoint('a', 'a')
        const b = createSkeletonJoint('b', 'b')
        connectJoint(a, b)
        b.position.set(0, 3, 0)
        skeleton.addJoint(a)
        skeleton.addJoint(b)
        skeleton.addBone(createSkeletonBone('x', a, b, 0, 'x'))
        expect(skeleton.findBone('x')!.length).toBeCloseTo(3)
    })

    it('id 重复抛错', () => {
        const skeleton = createSkeleton()
        skeleton.addJoint(createSkeletonJoint('a', 'a'))
        expect(() => skeleton.addJoint(createSkeletonJoint('a', 'a'))).toThrow()
    })

    it('removeBone 移除指定骨骼', () => {
        const skeleton = buildChain()
        skeleton.addBone(createSkeletonBone('m', skeleton.findJoint('root')!, skeleton.findJoint('mid')!, 2, 'm'))
        skeleton.removeBone('m')
        expect(skeleton.findBone('m')).toBeUndefined()
        expect(skeleton.bones.size).toBe(0)
    })
})

describe('骨架 removeJoint（仅断开）', () => {
    it('子树独立成根，下游世界变换不变', () => {
        const skeleton = buildChain()
        skeleton.updateWorldTransforms()
        const tipBefore = skeleton.getWorldPosition('tip')!.clone()
        skeleton.removeJoint('mid')
        expect(skeleton.findJoint('mid')).toBeUndefined()
        expect(skeleton.findJoint('tip')!.parent).toBeUndefined()
        expect(skeleton.getRoots()).toHaveLength(2)
        skeleton.updateWorldTransforms()
        expect(skeleton.getWorldPosition('tip')!.x).toBeCloseTo(tipBefore.x)
        expect(skeleton.getWorldPosition('tip')!.y).toBeCloseTo(tipBefore.y)
    })

    it('以该关节为 head/tail 的骨骼段一并移除，其余保留', () => {
        const skeleton = buildChain()
        skeleton.addBone(createSkeletonBone('m', skeleton.findJoint('root')!, skeleton.findJoint('mid')!, 2, 'm'))
        skeleton.addBone(createSkeletonBone('t', skeleton.findJoint('mid')!, skeleton.findJoint('tip')!, 1, 't'))
        const root2 = createSkeletonJoint('root2', 'root2')
        connectJoint(skeleton.findJoint('root')!, root2)
        skeleton.addJoint(root2)
        skeleton.addBone(createSkeletonBone('r2', skeleton.findJoint('root')!, root2, 1, 'r2'))
        skeleton.removeJoint('mid')
        expect(skeleton.findBone('m')).toBeUndefined()
        expect(skeleton.findBone('t')).toBeUndefined()
        expect(skeleton.findBone('r2')).toBeDefined()
        expect(skeleton.bones.size).toBe(1)
    })

    it('移除不存在的关节/骨骼为空操作', () => {
        const skeleton = createSkeleton()
        expect(() => skeleton.removeJoint('nope')).not.toThrow()
        expect(() => skeleton.removeBone('nope')).not.toThrow()
    })
})

describe('骨架 pose 读写', () => {
    it('readPose/applyPose 往返一致（含 roll、不含 length）', () => {
        const skeleton = buildChain()
        const mid = skeleton.findJoint('mid')!
        mid.rotation.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3)
        mid.position.set(0, 5, 0)
        const bone = createSkeletonBone('m', skeleton.findJoint('root')!, mid, 5, 'm')
        skeleton.addBone(bone)
        bone.roll = 0.7
        const pose = skeleton.readPose()
        skeleton.applyPose(pose)
        expect(skeleton.getWorldPosition('mid')!.y).toBeCloseTo(5)
        const pose2 = skeleton.readPose()
        expect(pose2.boneRolls.get('m')).toBe(0.7)
        expect(pose2.jointPoses.size).toBe(3)
    })

    it('applyPose 只写记录内的关节，未记录的保持原状', () => {
        const skeleton = buildChain()
        skeleton.updateWorldTransforms()
        const before = skeleton.getWorldPosition('tip')!.clone()
        skeleton.applyPose({jointPoses: new Map(), boneRolls: new Map()})
        const after = skeleton.getWorldPosition('tip')!
        expect(after.x).toBeCloseTo(before.x)
        expect(after.y).toBeCloseTo(before.y)
    })

    it('applyPose 对未知 id 静默跳过', () => {
        const skeleton = buildChain()
        const pose = skeleton.readPose()
        const ghostPose = new Map(pose.jointPoses)
        ghostPose.set('ghost', {position: new Vector3(9, 9, 9), rotation: new Quaternion()})
        expect(() => skeleton.applyPose({jointPoses: ghostPose, boneRolls: pose.boneRolls})).not.toThrow()
    })

    it('applyPose 不写根关节位置（根位移由外部管理，动画只驱动旋转）', () => {
        const skeleton = createSkeleton()
        const a = createSkeletonJoint('a', 'a')
        const b = createSkeletonJoint('b', 'b')
        connectJoint(a, b)
        a.position.set(5, 0, 3)
        skeleton.addJoint(a)
        skeleton.addJoint(b)
        /* 构建根关节位移被清零的 pose（模拟 clip 记录根位置为原点） */
        const pose = skeleton.readPose()
        pose.jointPoses.get('a')!.position.set(0, 0, 0)
        pose.jointPoses.get('a')!.rotation.setFromAxisAngle(new Vector3(0, 1, 0), 1)
        skeleton.applyPose(pose)
        /* 根位置保持外部设定值，不被动画覆盖 */
        expect(skeleton.findJoint('a')!.position.x).toBe(5)
        expect(skeleton.findJoint('a')!.position.z).toBe(3)
        /* 子关节位置照常写入 */
        expect(skeleton.findJoint('b')!.position.x).toBe(0)
    })
})