import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {sampleJointTrack, sampleSegmentTrack, sampleClip, sampleEvents} from './sampling.ts'
import type {BoneAnimationClip, BoneJointTrack, BoneSegmentTrack} from './types.ts'

const pos = (x: number, y = 0, z = 0): Vector3 => new Vector3(x, y, z)

const makeJointTrack = (records: readonly {time: number; x: number}[], interpolation: BoneJointTrack['interpolation'] = {type: 'bezier_quad', strategy: 'none'}): BoneJointTrack => ({
    targetId: 'a',
    interpolation,
    records: records.map(r => ({time: r.time, position: pos(r.x), rotation: new Quaternion()})),
})

describe('sampleJointTrack 采样', () => {
    it('关键帧时刻精确命中记录值', () => {
        const track = makeJointTrack([{time: 0, x: 0}, {time: 1, x: 2}])
        const at0 = sampleJointTrack(track, 0)!
        expect(at0.position.x).toBe(0)
        const at1 = sampleJointTrack(track, 1)!
        expect(at1.position.x).toBe(2)
    })

    it('帧间线性插值（none 策略退化为线性）', () => {
        const track = makeJointTrack([{time: 0, x: 0}, {time: 1, x: 2}])
        const mid = sampleJointTrack(track, 0.5)!
        expect(mid.position.x).toBeCloseTo(1)
        const quarter = sampleJointTrack(track, 0.25)!
        expect(quarter.position.x).toBeCloseTo(0.5)
    })

    it('ease_in 策略对进度施加 t² 缓动', () => {
        const track = makeJointTrack([{time: 0, x: 0}, {time: 1, x: 4}], {type: 'bezier_quad', strategy: 'ease_in'})
        const at0_5 = sampleJointTrack(track, 0.5)!
        /* eased = 0.25 → x = 4 × 0.25 = 1 */
        expect(at0_5.position.x).toBeCloseTo(1)
    })

    it('旋转用 slerp（半程 = 45°）', () => {
        const track: BoneJointTrack = {
            targetId: 'a',
            interpolation: {type: 'bezier_quad', strategy: 'none'},
            records: [
                {time: 0, position: pos(0), rotation: new Quaternion()},
                {time: 1, position: pos(0), rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)},
            ],
        }
        const mid = sampleJointTrack(track, 0.5)!
        expect(mid.rotation.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4))).toBeLessThan(1e-6)
    })

    it('非循环越界：clamp 到最近记录（nearest）', () => {
        const track = makeJointTrack([{time: 0.5, x: 1}, {time: 1, x: 2}])
        expect(sampleJointTrack(track, 0.2)!.position.x).toBe(1)
        expect(sampleJointTrack(track, 1.5)!.position.x).toBe(2)
    })

    it('wrap：循环时末帧 → 首帧插值无缝', () => {
        const track = makeJointTrack([{time: 0, x: 0}, {time: 0.5, x: 1}])
        /* t=0.9：0.5 → 0（wrap），span = 0 + 1 − 0.5 = 0.5，p = 0.8 */
        const wrapped = sampleJointTrack(track, 0.9, true, 1)!
        expect(wrapped.position.x).toBeCloseTo(0.2)
        /* t=-0.1（首帧之前）：末帧 0.5 → 首帧 0，p = (-0.1 + 1 − 0.5)/0.5 = 0.8 */
        const beforeFirst = sampleJointTrack(track, -0.1, true, 1)!
        expect(beforeFirst.position.x).toBeCloseTo(0.2)
    })

    it('wrap：直接调用传多周期时间时归一化到周期内（p 不越界）', () => {
        const track = makeJointTrack([{time: 0, x: 0}, {time: 0.5, x: 1}])
        /* t=1.7 等价于 t=0.7：0.5 → 0 wrap，p = 0.4 */
        const multi = sampleJointTrack(track, 1.7, true, 1)!
        expect(multi.position.x).toBeCloseTo(0.6)
        /* 与 t=0.7 直接采样一致 */
        const direct = sampleJointTrack(track, 0.7, true, 1)!
        expect(multi.position.x).toBeCloseTo(direct.position.x)
    })

    it('空轨返回 undefined', () => {
        expect(sampleJointTrack({targetId: 'a', interpolation: {type: 'linear'}, records: []}, 0.5)).toBeUndefined()
    })

    it('单记录轨任何时刻都返回该记录', () => {
        const track = makeJointTrack([{time: 0.5, x: 7}])
        expect(sampleJointTrack(track, 0.2)!.position.x).toBe(7)
        expect(sampleJointTrack(track, 0.9)!.position.x).toBe(7)
    })
})

describe('sampleSegmentTrack 采样', () => {
    const track: BoneSegmentTrack = {
        targetId: 'b',
        interpolation: {type: 'bezier_quad', strategy: 'none'},
        records: [
            {time: 0, roll: 0},
            {time: 1, roll: 1},
        ],
    }

    it('roll 线性插值', () => {
        expect(sampleSegmentTrack(track, 0.5)!.roll).toBeCloseTo(0.5)
        expect(sampleSegmentTrack(track, 0)!.roll).toBe(0)
        expect(sampleSegmentTrack(track, 1)!.roll).toBe(1)
    })

    it('越界 nearest 与空轨 undefined', () => {
        expect(sampleSegmentTrack(track, 2)!.roll).toBe(1)
        expect(sampleSegmentTrack({targetId: 'b', interpolation: {type: 'linear'}, records: []}, 0.5)).toBeUndefined()
    })
})

describe('sampleClip 整段采样', () => {
    const makeClip = (loop: boolean): BoneAnimationClip => ({
        name: 'clip',
        duration: 1,
        loop,
        jointTracks: [makeJointTrack([{time: 0, x: 0}, {time: 1, x: 2}], {type: 'linear'})],
        boneTracks: [{targetId: 'b', interpolation: {type: 'linear'}, records: [{time: 0, roll: 0}, {time: 1, roll: 0.5}]}],
        eventTracks: [],
    })

    it('输出骨架姿态（关节 pose + 骨骼 roll）', () => {
        const pose = sampleClip(makeClip(false), 0.5)
        expect(pose.jointPoses.get('a')!.position.x).toBeCloseTo(1)
        expect(pose.boneRolls.get('b')).toBeCloseTo(0.25)
    })

    it('循环时 time 取模；非循环越界夹取', () => {
        expect(sampleClip(makeClip(true), 1.5).jointPoses.get('a')!.position.x).toBeCloseTo(1)
        expect(sampleClip(makeClip(false), 1.5).jointPoses.get('a')!.position.x).toBeCloseTo(2)
    })
})

describe('sampleEvents 事件查询', () => {
    const clip: BoneAnimationClip = {
        name: 'events',
        duration: 1,
        loop: false,
        jointTracks: [],
        boneTracks: [],
        eventTracks: [{
            records: [
                {time: 0.2, eventName: 'a'},
                {time: 0.5, eventName: 'b'},
                {time: 0.5, eventName: 'c'},
                {time: 0.8, eventName: 'd'},
            ],
        }],
    }

    it('左开右闭：from 时刻不触发，to 时刻触发', () => {
        const events = sampleEvents(clip, 0.2, 0.5)
        expect(events.map(e => e.eventName)).toEqual(['b', 'c'])
    })

    it('区间为空时返回空数组', () => {
        expect(sampleEvents(clip, 0.5, 0.2)).toHaveLength(0)
        expect(sampleEvents(clip, 0.5, 0.5)).toHaveLength(0)
    })
})