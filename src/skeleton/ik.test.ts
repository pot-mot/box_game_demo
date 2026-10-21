import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {createSkeleton} from './skeleton.ts'
import {createSkeletonJoint, connectJoint} from './joint.ts'
import {createSkeletonBone} from './bone.ts'
import {collectChainBetween, resolveIkChain, solveCcd, solveFabrik, solveIkChain} from './ik.ts'
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

describe('resolveIkChain 按父级段数回溯', () => {
    it('默认影响 2 段父级（wrist → shoulder）', () => {
        const skeleton = buildArm()
        const chain = resolveIkChain(skeleton.findJoint('wrist')!)
        expect(chain.map(j => j.id)).toEqual(['shoulder', 'elbow', 'wrist'])
    })

    it('链深度 = 1 时只影响直接父级', () => {
        const skeleton = buildArm()
        const chain = resolveIkChain(skeleton.findJoint('wrist')!, 1)
        expect(chain.map(j => j.id)).toEqual(['elbow', 'wrist'])
    })

    it('链深度超过祖先数量时截断到树根', () => {
        const skeleton = buildArm()
        const chain = resolveIkChain(skeleton.findJoint('wrist')!, 99)
        expect(chain.map(j => j.id)).toEqual(['root', 'shoulder', 'elbow', 'wrist'])
    })

    it('退化：末端即树根返回单元素链', () => {
        const skeleton = buildArm()
        const chain = resolveIkChain(skeleton.findJoint('root')!)
        expect(chain.map(j => j.id)).toEqual(['root'])
    })
})

describe('collectChainBetween 显式链', () => {
    it('root 是 end 的祖先时返回完整链', () => {
        const skeleton = buildArm()
        const chain = collectChainBetween(skeleton.findJoint('shoulder')!, skeleton.findJoint('wrist')!)
        expect(chain.map(j => j.id)).toEqual(['shoulder', 'elbow', 'wrist'])
    })

    it('root 不是 end 的祖先时返回空数组', () => {
        const skeleton = buildArm()
        const other = createSkeletonJoint('other', 'other')
        skeleton.addJoint(other)
        expect(collectChainBetween(other, skeleton.findJoint('wrist')!)).toEqual([])
    })
})

describe('IK 求解（CCD / FABRIK）', () => {
    const options = {maxIterations: DEFAULT_IK_MAX_ITERATIONS, tolerance: DEFAULT_IK_TOLERANCE}
    const fullChain = (skeleton: ReturnType<typeof createSkeleton>) =>
        resolveIkChain(skeleton.findJoint('wrist')!, 3)

    for (const [label, solve] of [
        ['CCD', solveCcd],
        ['FABRIK', solveFabrik],
    ] as const) {
        it(`${label}：可达目标收敛到目标点`, () => {
            const skeleton = buildArm()
            const target = new Vector3(1.5, 0.5, 0)
            const result = solve(skeleton, fullChain(skeleton), target, options)
            const wristPos = skeleton.getWorldPosition('wrist')!
            expect(wristPos.distanceTo(target)).toBeLessThan(0.02)
            expect(result.error).toBeLessThan(0.02)
            expect(result.iterations).toBeLessThanOrEqual(options.maxIterations)
        })

        it(`${label}：不可达目标不劣化`, () => {
            const skeleton = buildArm()
            skeleton.updateWorldTransforms()
            const before = skeleton.getWorldPosition('wrist')!.clone()
            const target = new Vector3(50, 50, 50)
            solve(skeleton, fullChain(skeleton), target, options)
            const after = skeleton.getWorldPosition('wrist')!
            expect(after.distanceTo(target)).toBeLessThanOrEqual(before.distanceTo(target))
        })

        it(`${label}：退化链不修改姿态`, () => {
            const skeleton = buildArm()
            const root = skeleton.findJoint('root')!
            skeleton.updateWorldTransforms()
            const before = skeleton.getWorldPosition('root')!.clone()
            const result = solve(skeleton, [root], new Vector3(5, 0, 0), options)
            expect(result.iterations).toBe(0)
            expect(skeleton.getWorldPosition('root')!.distanceTo(before)).toBe(0)
        })

        it(`${label}：链根位置固定`, () => {
            const skeleton = buildArm()
            skeleton.updateWorldTransforms()
            const rootBefore = skeleton.getWorldPosition('root')!.clone()
            solve(skeleton, fullChain(skeleton), new Vector3(1.5, 0.5, 0), options)
            expect(skeleton.getWorldPosition('root')!.distanceTo(rootBefore)).toBeLessThan(1e-6)
        })
    }

    it('solveIkChain 按求解器 id 分发', () => {
        const skeleton = buildArm()
        const target = new Vector3(1.5, 0.5, 0)
        const result = solveIkChain(skeleton, fullChain(skeleton), target, 'fabrik', options)
        expect(result.error).toBeLessThan(0.02)
    })

    it('目标与末端重合时不旋转', () => {
        const skeleton = buildArm()
        skeleton.updateWorldTransforms()
        const target = skeleton.getWorldPosition('wrist')!.clone()
        const before = skeleton.readPose()
        solveCcd(skeleton, fullChain(skeleton), target, options)
        const after = skeleton.readPose()
        for (const [id, pose] of before.jointPoses) {
            const afterPose = after.jointPoses.get(id)
            expect(afterPose!.position.distanceTo(pose.position)).toBeLessThan(1e-6)
        }
    })
})
