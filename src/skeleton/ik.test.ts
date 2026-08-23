import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {createSkeleton} from './skeleton.ts'
import {createSkeletonJoint, connectJoint} from './joint.ts'
import {createSkeletonBone} from './bone.ts'
import {resolveIkChain, solveCcd} from './ik.ts'
import {DEFAULT_IK_MAX_ITERATIONS, DEFAULT_IK_TOLERANCE} from './constants.ts'

/** 构建双臂链：root → shoulder → elbow → wrist，每段 +Y 方向 */
const buildArm = (): ReturnType<typeof createSkeleton> => {
    const skeleton = createSkeleton()
    const root = createSkeletonJoint('root', 'root')
    const shoulder = createSkeletonJoint('shoulder', 'shoulder')
    const elbow = createSkeletonJoint('elbow', 'elbow')
    const wrist = createSkeletonJoint('wrist', 'wrist')
    connectJoint(root, shoulder)
    connectJoint(shoulder, elbow)
    connectJoint(elbow, wrist)
    shoulder.position.set(0, 1, 0)
    elbow.position.set(0, 1, 0)
    wrist.position.set(0, 1, 0)
    skeleton.addJoint(root)
    skeleton.addJoint(shoulder)
    skeleton.addJoint(elbow)
    skeleton.addJoint(wrist)
    skeleton.addBone(createSkeletonBone('up', shoulder, elbow, 1, 'up'))
    skeleton.addBone(createSkeletonBone('fore', elbow, wrist, 1, 'fore'))
    return skeleton
}

describe('resolveIkChain 链回溯', () => {
    it('无 IK 根时回退本树根（root → wrist）', () => {
        const skeleton = buildArm()
        const wrist = skeleton.findJoint('wrist')!
        const chain = resolveIkChain(wrist)
        expect(chain.map(j => j.id)).toEqual(['root', 'shoulder', 'elbow', 'wrist'])
    })

    it('回溯遇到的第一个 IK 根作为链根（肩膀设根后截断）', () => {
        const skeleton = buildArm()
        skeleton.findJoint('shoulder')!.ikRootLevel = 0
        const chain = resolveIkChain(skeleton.findJoint('wrist')!)
        expect(chain.map(j => j.id)).toEqual(['shoulder', 'elbow', 'wrist'])
    })

    it('多级 IK 根取最接近末端的那个（elbow 设根后取 elbow）', () => {
        const skeleton = buildArm()
        skeleton.findJoint('shoulder')!.ikRootLevel = 0
        skeleton.findJoint('elbow')!.ikRootLevel = 1
        const chain = resolveIkChain(skeleton.findJoint('wrist')!)
        expect(chain.map(j => j.id)).toEqual(['elbow', 'wrist'])
    })

    it('多根骨架不跨树（另一棵树的关节不影响本树回溯）', () => {
        const skeleton = buildArm()
        const other = createSkeletonJoint('other', 'other')
        other.ikRootLevel = 0
        skeleton.addJoint(other)
        const chain = resolveIkChain(skeleton.findJoint('wrist')!)
        expect(chain.map(j => j.id)).toEqual(['root', 'shoulder', 'elbow', 'wrist'])
    })

    it('退化：末端即树根返回单元素链', () => {
        const skeleton = buildArm()
        const chain = resolveIkChain(skeleton.findJoint('root')!)
        expect(chain.map(j => j.id)).toEqual(['root'])
    })
})

describe('solveCcd 求解', () => {
    const options = {maxIterations: DEFAULT_IK_MAX_ITERATIONS, tolerance: DEFAULT_IK_TOLERANCE}

    it('可达目标：末端收敛到目标点（误差 < tolerance）', () => {
        const skeleton = buildArm()
        /* 臂自然下垂指向 +Y，目标在 +X 侧上方 */
        const target = new Vector3(1.5, 0.5, 0)
        const result = solveCcd(skeleton, resolveIkChain(skeleton.findJoint('wrist')!), target, options)
        const wristPos = skeleton.getWorldPosition('wrist')!
        expect(wristPos.distanceTo(target)).toBeLessThan(options.tolerance)
        expect(result.error).toBeLessThan(options.tolerance)
        expect(result.iterations).toBeLessThanOrEqual(options.maxIterations)
    })

    it('迭代次数不超过 maxIterations', () => {
        const skeleton = buildArm()
        const target = new Vector3(50, 50, 50)
        const result = solveCcd(skeleton, resolveIkChain(skeleton.findJoint('wrist')!), target, options)
        expect(result.iterations).toBeLessThanOrEqual(options.maxIterations)
    })

    it('不可达目标：误差不增（求解不劣化）', () => {
        const skeleton = buildArm()
        skeleton.updateWorldTransforms()
        const before = skeleton.getWorldPosition('wrist')!
        const target = new Vector3(50, 50, 50)
        solveCcd(skeleton, resolveIkChain(skeleton.findJoint('wrist')!), target, options)
        const after = skeleton.getWorldPosition('wrist')!
        /* 链全展开后末端应比初始更接近目标（初始完全松弛下垂） */
        expect(after.distanceTo(target)).toBeLessThanOrEqual(before.distanceTo(target))
    })

    it('退化链（长度 <= 1）不修改姿态', () => {
        const skeleton = buildArm()
        const root = skeleton.findJoint('root')!
        skeleton.updateWorldTransforms()
        const before = skeleton.getWorldPosition('root')!.clone()
        const result = solveCcd(skeleton, [root], new Vector3(5, 0, 0), options)
        expect(result.iterations).toBe(0)
        expect(skeleton.getWorldPosition('root')!.distanceTo(before)).toBe(0)
    })

    it('目标与末端重合时不旋转（sin ≈ 0 跳过）', () => {
        const skeleton = buildArm()
        const wrist = skeleton.findJoint('wrist')!
        skeleton.updateWorldTransforms()
        const target = skeleton.getWorldPosition('wrist')!.clone()
        const before = skeleton.readPose()
        solveCcd(skeleton, resolveIkChain(wrist), target, options)
        const after = skeleton.readPose()
        for (const [id, pose] of before.jointPoses) {
            const afterPose = after.jointPoses.get(id)
            expect(afterPose!.position.distanceTo(pose.position)).toBeLessThan(1e-6)
        }
    })

    it('IK 根固定：链根关节位置不因求解移动', () => {
        const skeleton = buildArm()
        skeleton.findJoint('shoulder')!.ikRootLevel = 0
        skeleton.updateWorldTransforms()
        const shoulderBefore = skeleton.getWorldPosition('shoulder')!.clone()
        solveCcd(skeleton, resolveIkChain(skeleton.findJoint('wrist')!), new Vector3(1.5, 0.5, 0), options)
        const shoulderAfter = skeleton.getWorldPosition('shoulder')!
        expect(shoulderAfter.distanceTo(shoulderBefore)).toBeLessThan(1e-6)
    })
})