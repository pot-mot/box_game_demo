import {describe, it, expect} from 'vitest'
import {Euler, Quaternion} from 'three'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {sampleClip} from '../../../../../skeleton/anim/sampling.ts'
import {
    animationModuleCacheKey,
    bakeAnimationModule,
    flattenComposition,
    sampleComposition,
    type AnimationComposition,
    type AnimationModule,
    type SkeletonAnimation,
} from './composition.ts'

const SKELETON: SkeletonDefinition = {
    joints: [
        {id: 'root', name: 'root', position: [0, 0, 0], rotation: [0, 0, 0, 1]},
        {id: 'a', name: 'a', parentId: 'root', position: [0, 1, 0], rotation: [0, 0, 0, 1]},
        {id: 'b', name: 'b', parentId: 'root', position: [1, 0, 0], rotation: [0, 0, 0, 1]},
    ],
    bones: [],
}

const linear = (id: string, jointId: string, axis: 0 | 1 | 2, amount: number, duration = 1): SkeletonAnimation => ({
    id,
    duration,
    loop: false,
    sample: progress => ({[jointId]: [axis === 0 ? progress * amount : 0, axis === 1 ? progress * amount : 0, axis === 2 ? progress * amount : 0]}),
})

describe('骨骼动画组合模型', () => {
    const a = linear('a', 'a', 0, 1)
    const b = linear('b', 'b', 1, 2)

    it('组合按权重归一化平均，起止时间外不贡献', () => {
        const composition: AnimationComposition = {
            id: 'mix',
            duration: 1,
            layers: [
                {source: a, weight: 1, start: 0, end: 1},
                {source: b, weight: 3, start: 0, end: 0.5},
            ],
        }
        const atStart = sampleComposition(composition, 0)
        expect(atStart.a).toEqual([0, 0, 0])
        expect(atStart.b).toEqual([0, 0, 0])
        const atQuarter = sampleComposition(composition, 0.25)
        /* a: 1 × 0.25 / 1；b 在自身 0.5 进度处 → 2，权重归一化后仍为 2 */
        expect((atQuarter.a as readonly number[])[0]).toBeCloseTo(0.25, 8)
        expect((atQuarter.b as readonly number[])[1]).toBeCloseTo(1, 8)
        const afterB = sampleComposition(composition, 0.75)
        expect(afterB.b).toBeUndefined()
    })

    it('组合再组合等价于扁平化组合', () => {
        const inner: AnimationComposition = {
            id: 'inner',
            duration: 1,
            layers: [
                {source: a, weight: 1, start: 0, end: 0.5},
                {source: b, weight: 2, start: 0.5, end: 1},
            ],
        }
        const outer: AnimationComposition = {
            id: 'outer',
            duration: 2,
            layers: [
                {source: inner, weight: 1, start: 0.5, end: 1.5},
                {source: a, weight: 0.5, start: 0, end: 2},
            ],
        }
        const flat = flattenComposition(outer)
        for (const t of [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]) {
            const nested = sampleComposition(outer, t)
            const flattened = sampleComposition(flat, t)
            for (const jointId of ['a', 'b']) {
                const n = nested[jointId] as readonly number[] | undefined
                const f = flattened[jointId] as readonly number[] | undefined
                if (n === undefined) expect(f).toBeUndefined()
                else {
                    expect(f).toBeDefined()
                    for (let axis = 0; axis < 3; axis++) expect(f![axis]).toBeCloseTo(n[axis], 8)
                }
            }
        }
    })

    it('烘焙 clip 与运行时组合采样一致（播放期零组合计算）', () => {
        const composition: AnimationComposition = {
            id: 'baked',
            duration: 1,
            layers: [
                {source: a, weight: 0.5, start: 0, end: 1},
                {source: b, weight: 0.5, start: 0.5, end: 1},
            ],
        }
        const module: AnimationModule = {
            id: 'm',
            nameKey: 'bone_edit.state.idle',
            animations: [a, b],
            compositions: [composition],
        }
        const clips = bakeAnimationModule(SKELETON, module, 60, '1')
        const clip = clips.get('baked')!
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const expected = sampleComposition(composition, t)
            const actual = sampleClip(clip, t).jointPoses
            for (const jointId of ['a', 'b']) {
                const e = expected[jointId]
                const got = actual.get(jointId)
                if (e === undefined) continue
                expect(got, jointId).toBeDefined()
                const expectedRotation = new Quaternion().setFromEuler(new Euler(
                    (e as readonly number[])[0],
                    (e as readonly number[])[1],
                    (e as readonly number[])[2],
                    'XYZ',
                ))
                expect(got!.rotation.angleTo(expectedRotation)).toBeLessThan(1e-3)
            }
        }
    })

    it('动画不能引用骨架不存在的节点（烘焙 fail loudly）', () => {
        const invalid: SkeletonAnimation = linear('bad', 'missing', 0, 1)
        const module: AnimationModule = {id: 'bad', nameKey: 'bone_edit.state.idle', animations: [invalid], compositions: []}
        expect(() => bakeAnimationModule(SKELETON, module, 30)).toThrow(/骨架不存在/)
    })

    it('缓存键只由骨架签名 + 动画模组版本决定（装备变化不重烘）', () => {
        expect(animationModuleCacheKey('skel', 'v1')).toBe(animationModuleCacheKey('skel', 'v1'))
        expect(animationModuleCacheKey('skel', 'v1')).not.toBe(animationModuleCacheKey('skel', 'v2'))
        expect(animationModuleCacheKey('skel', 'v1')).toContain('skel')
        expect(animationModuleCacheKey('skel', 'v1')).toContain('v1')
    })
})
