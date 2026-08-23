import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {createSkeletonJoint, connectJoint} from './joint.ts'
import {createSkeleton, type Skeleton} from './skeleton.ts'
import {createSkeletonBone, rotateBone, setBoneLength, setBoneRoll, boneDirection} from './bone.ts'

const boneOf = (skeleton: Skeleton, id: string) => {
    const bone = skeleton.findBone(id)
    if (bone === undefined) throw new Error(`bone not found: ${id}`)
    return bone
}

describe('骨骼段', () => {
    it('创建：默认 id 由 head__tail 组成，length 默认 0', () => {
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        connectJoint(head, tail)
        const bone = createSkeletonBone('bone', head, tail)
        expect(bone.id).toBe('h__t')
        expect(bone.length).toBe(0)
        expect(bone.roll).toBe(0)
    })

    it('方向派生：世界方向 = tail − head 单位向量', () => {
        const skeleton = createSkeleton()
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        connectJoint(head, tail)
        tail.position.set(0, 2, 0)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        skeleton.addBone(createSkeletonBone('bone', head, tail, 2, 'b'))
        const dir = boneDirection(skeleton, boneOf(skeleton, 'b'))
        expect(dir.y).toBeCloseTo(1)
        expect(dir.x).toBeCloseTo(0)
        expect(dir.z).toBeCloseTo(0)
    })

    it('方向派生：父关节旋转后方向随之旋转', () => {
        const skeleton = createSkeleton()
        const root = createSkeletonJoint('root', 'r')
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        connectJoint(root, head)
        connectJoint(head, tail)
        tail.position.set(0, 0, 2)
        head.rotation.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
        skeleton.addJoint(root)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        skeleton.addBone(createSkeletonBone('bone', head, tail, 2, 'b'))
        const dir = boneDirection(skeleton, boneOf(skeleton, 'b'))
        expect(dir.x).toBeCloseTo(1)
        expect(dir.z).toBeCloseTo(0)
    })

    it('rotateBone 级联：tail 子树整体绕 head 旋转', () => {
        const skeleton = createSkeleton()
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        const grand = createSkeletonJoint('grand', 'g')
        connectJoint(head, tail)
        connectJoint(tail, grand)
        tail.position.set(1, 0, 0)
        grand.position.set(0, 1, 0)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        skeleton.addJoint(grand)
        skeleton.addBone(createSkeletonBone('bone', head, tail, 1, 'b'))
        /* 绕世界 Y 轴旋转 90°：head→tail 从 +X 转到 −Z */
        rotateBone(skeleton, boneOf(skeleton, 'b'), new Vector3(0, 1, 0), Math.PI / 2)
        const tailPos = skeleton.getWorldPosition('t')!
        const grandPos = skeleton.getWorldPosition('g')!
        expect(tailPos.x).toBeCloseTo(0)
        expect(tailPos.z).toBeCloseTo(-1)
        expect(grandPos.x).toBeCloseTo(0)
        expect(grandPos.y).toBeCloseTo(1)
        expect(grandPos.z).toBeCloseTo(-1)
    })

    it('rotateBone 级联：head 位置保持不动', () => {
        const skeleton = createSkeleton()
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        connectJoint(head, tail)
        head.position.set(1, 1, 0)
        tail.position.set(2, 1, 0)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        skeleton.addBone(createSkeletonBone('bone', head, tail, 1, 'b'))
        rotateBone(skeleton, boneOf(skeleton, 'b'), new Vector3(0, 0, 1), Math.PI)
        const headPos = skeleton.getWorldPosition('h')!
        expect(headPos.x).toBeCloseTo(1)
        expect(headPos.y).toBeCloseTo(1)
    })

    it('setBoneLength 级联：tail 沿段方向平移，下游跟随', () => {
        const skeleton = createSkeleton()
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        const grand = createSkeletonJoint('grand', 'g')
        connectJoint(head, tail)
        connectJoint(tail, grand)
        tail.position.set(1, 0, 0)
        grand.position.set(0, 1, 0)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        skeleton.addJoint(grand)
        skeleton.addBone(createSkeletonBone('bone', head, tail, 1, 'b'))
        setBoneLength(skeleton, boneOf(skeleton, 'b'), 2)
        const tailPos = skeleton.getWorldPosition('t')!
        const grandPos = skeleton.getWorldPosition('g')!
        expect(tailPos.x).toBeCloseTo(2)
        expect(grandPos.x).toBeCloseTo(2)
        expect(grandPos.y).toBeCloseTo(1)
    })

    it('setBoneLength：非法长度抛错', () => {
        const skeleton = createSkeleton()
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        connectJoint(head, tail)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        const bone = createSkeletonBone('bone', head, tail, 1, 'b')
        skeleton.addBone(bone)
        expect(() => setBoneLength(skeleton, bone, 0)).toThrow()
    })

    it('setBoneRoll 写入字段，applyPose 后绕段轴扭转带动下游', () => {
        const skeleton = createSkeleton()
        const head = createSkeletonJoint('head', 'h')
        const tail = createSkeletonJoint('tail', 't')
        const grand = createSkeletonJoint('grand', 'g')
        connectJoint(head, tail)
        connectJoint(tail, grand)
        tail.position.set(0, 2, 0)
        grand.position.set(0, 0, 1)
        skeleton.addJoint(head)
        skeleton.addJoint(tail)
        skeleton.addJoint(grand)
        const bone = createSkeletonBone('bone', head, tail, 2, 'b')
        skeleton.addBone(bone)
        /* 无 roll：grand 世界位置 = (0,2,1) */
        skeleton.updateWorldTransforms()
        expect(skeleton.getWorldPosition('g')!.z).toBeCloseTo(1)
        /* roll 90°：tail 世界旋转绕段轴（+Y）扭转 90°，grand 转到 (1,2,0) */
        setBoneRoll(bone, Math.PI / 2)
        skeleton.applyPose(skeleton.readPose())
        const grandPos = skeleton.getWorldPosition('g')!
        expect(grandPos.x).toBeCloseTo(1)
        expect(grandPos.y).toBeCloseTo(2)
        expect(grandPos.z).toBeCloseTo(0)
    })
})