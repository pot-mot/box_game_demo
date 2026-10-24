import {describe, expect, it} from 'vitest'
import type {JointEulers} from '../creature_runtime/pose.ts'
import {
    evaluateProgressComposition,
    leafEventsInRange,
    type ProgressAnimationComposition,
    type ProgressAnimationLayer,
    type ProgressAnimationLeaf,
    type ProgressAnimationSource,
    type ProgressWeight,
} from './progress_composition.ts'

const REST: JointEulers = {a: [0, 0, 0], b: [0, 0, 0]}

const leaf = (id: string, pose: JointEulers, events?: ProgressAnimationLeaf['events']): ProgressAnimationLeaf => ({
    id,
    joints: Object.keys(pose),
    sample: () => pose,
    ...(events !== undefined ? {events} : {}),
})

const layer = (
    source: ProgressAnimationSource,
    weight: ProgressWeight = 1,
    options: Partial<Omit<ProgressAnimationLayer, 'source' | 'weight'>> = {},
): ProgressAnimationLayer => ({
    source,
    weight,
    from: 0,
    to: 1,
    mode: 'normal',
    ...options,
})

const composition = (...layers: ProgressAnimationLayer[]): ProgressAnimationComposition => ({id: 'test', layers})

describe('evaluateProgressComposition', () => {
    it('同关节 normal 贡献按有效权重归一化加权平均', () => {
        const result = evaluateProgressComposition(
            composition(layer(leaf('a', {a: [10, 0, 0]}), 1), layer(leaf('b', {a: [20, 0, 0]}), 3)),
            0,
            {restPose: REST},
        )
        expect(result.a).toEqual([17.5, 0, 0])
    })

    it('每关节权重为 0 的层不参与该关节', () => {
        const result = evaluateProgressComposition(
            composition(
                layer(leaf('a', {a: [10, 0, 0]}), 1),
                layer(leaf('b', {a: [20, 0, 0]}), 1, {jointWeights: {a: 0}}),
            ),
            0,
            {restPose: REST},
        )
        expect(result.a).toEqual([10, 0, 0])
    })

    it('多级组合的有效权重 = 路径权重乘积', () => {
        const child = composition(layer(leaf('a', {a: [10, 0, 0]}), 1))
        const result = evaluateProgressComposition(
            composition(layer(child, 0.25), layer(leaf('b', {a: [20, 0, 0]}), 0.75)),
            0,
            {restPose: REST},
        )
        expect(result.a).toEqual([17.5, 0, 0])
    })

    it('未覆盖关节回退 rest', () => {
        const result = evaluateProgressComposition(
            composition(layer(leaf('a', {a: [10, 0, 0]}), 1)),
            0,
            {restPose: {a: [0, 0, 0], b: [5, 0, 0]}},
        )
        expect(result.b).toEqual([5, 0, 0])
    })

    it('additive 在 normal 归一化之后按 rest 增量叠加', () => {
        const result = evaluateProgressComposition(
            composition(
                layer(leaf('base', {a: [10, 0, 0]}), 1),
                layer(leaf('add', {a: [20, 0, 0]}), 0.5, {mode: 'additive'}),
            ),
            0,
            {restPose: REST},
        )
        expect(result.a).toEqual([20, 0, 0])
    })

    it('没有 normal 覆盖时 additive 以 rest 为基准', () => {
        const result = evaluateProgressComposition(
            composition(layer(leaf('add', {a: [10, 0, 0]}), 0.5, {mode: 'additive'})),
            0,
            {restPose: {a: [4, 0, 0]}},
        )
        expect(result.a).toEqual([7, 0, 0])
    })

    it('边 from/to 映射子 progress', () => {
        const sampled: ProgressAnimationLeaf = {
            id: 'progress',
            joints: ['a'],
            sample: progress => ({a: [progress * 10, 0, 0]}),
        }
        const result = evaluateProgressComposition(
            composition(layer(sampled, 1, {from: 0.5, to: 1})),
            0.75,
            {restPose: REST},
        )
        expect(result.a).toEqual([5, 0, 0])
    })

    it('repeat 在 progress 空间内循环子动画', () => {
        const sampled: ProgressAnimationLeaf = {
            id: 'progress',
            joints: ['a'],
            sample: progress => ({a: [progress * 10, 0, 0]}),
        }
        const comp = composition(layer(sampled, 1, {from: 0, to: 1, repeat: 2}))
        expect(evaluateProgressComposition(comp, 0.25, {restPose: REST}).a).toEqual([5, 0, 0])
        expect(evaluateProgressComposition(comp, 0.75, {restPose: REST}).a).toEqual([5, 0, 0])
        expect(evaluateProgressComposition(comp, 1, {restPose: REST}).a).toEqual([0, 0, 0])
    })

    it('位置随权重平均，并与 rest 位置合并', () => {
        const positioned: ProgressAnimationLeaf = {
            id: 'pos',
            joints: ['a'],
            sample: () => ({a: {rotation: [0, 0, 0], position: [2, 0, 0]}}),
        }
        const result = evaluateProgressComposition(
            composition(layer(positioned, 1)),
            0,
            {restPose: {a: {rotation: [0, 0, 0], position: [0, 0, 0]}}},
        )
        expect(result.a).toEqual({rotation: [0, 0, 0], position: [2, 0, 0]})
    })

    it('纯旋转 additive 层不改变位置', () => {
        const base: ProgressAnimationLeaf = {
            id: 'base',
            joints: ['a'],
            sample: () => ({a: {rotation: [0, 0, 0], position: [1, 2, 3]}}),
        }
        const additive: ProgressAnimationLeaf = {
            id: 'additive',
            joints: ['a'],
            sample: () => ({a: [0.2, 0, 0]}),
        }
        const result = evaluateProgressComposition(
            composition(layer(base, 1), layer(additive, 1, {mode: 'additive'})),
            0,
            {restPose: {a: {rotation: [0, 0, 0], position: [0, 0, 0]}}},
        )
        expect(result.a).toEqual({rotation: [0.2, 0, 0], position: [1, 2, 3]})
    })

    it('边权重支持参数绑定', () => {
        const comp = composition(
            layer(leaf('a', {a: [10, 0, 0]}), 1),
            layer(leaf('b', {a: [20, 0, 0]}), params => typeof params.mix === 'number' ? params.mix : 0),
        )
        expect(evaluateProgressComposition(comp, 0, {restPose: REST, params: {mix: 3}}).a).toEqual([17.5, 0, 0])
    })

    it('层 progress 支持参数绑定（与父进度解耦）', () => {
        const sampled: ProgressAnimationLeaf = {
            id: 'progress',
            joints: ['a'],
            sample: progress => ({a: [progress * 10, 0, 0]}),
        }
        const comp = composition(layer(sampled, 1, {
            progress: params => typeof params.p === 'number' ? params.p : 0,
        }))
        expect(evaluateProgressComposition(comp, 0, {restPose: REST, params: {p: 0.5}}).a).toEqual([5, 0, 0])
    })

    it('相同 progress + params 输出确定一致', () => {
        const comp = composition(layer(leaf('a', {a: [10, 0, 0]}), 1))
        expect(evaluateProgressComposition(comp, 0.3, {restPose: REST}))
            .toEqual(evaluateProgressComposition(comp, 0.3, {restPose: REST}))
    })
})

describe('leafEventsInRange', () => {
    const events = [
        {progress: 0.25, eventName: 'hitbox_on'},
        {progress: 0.5, eventName: 'hitbox_off'},
    ]

    it('返回区间内的事件', () => {
        const target = leaf('e', {a: [0, 0, 0]}, events)
        expect(leafEventsInRange(target, 0.2, 0.4)).toEqual([{progress: 0.25, eventName: 'hitbox_on'}])
    })

    it('处理循环跨 1 → 0', () => {
        const target = leaf('e', {a: [0, 0, 0]}, events)
        expect(leafEventsInRange(target, 0.4, 0.3).map(event => event.eventName))
            .toEqual(['hitbox_off', 'hitbox_on'])
    })
})
