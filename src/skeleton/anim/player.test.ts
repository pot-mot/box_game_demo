import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {createSkeleton} from '../skeleton.ts'
import {createSkeletonJoint, connectJoint} from '../joint.ts'
import type {BoneAnimationClip, BoneEventRecord} from './types.ts'
import {createBoneAnimationPlayer} from './player.ts'

/** 构建 3 关节链 + 记录关节位置动画的 clip */
const makeRig = (): {skeleton: ReturnType<typeof createSkeleton>; clip: BoneAnimationClip} => {
    const skeleton = createSkeleton()
    const root = createSkeletonJoint('root', 'root')
    const mid = createSkeletonJoint('mid', 'mid')
    const tip = createSkeletonJoint('tip', 'tip')
    connectJoint(root, mid)
    connectJoint(mid, tip)
    mid.position.set(0, 1, 0)
    tip.position.set(0, 1, 0)
    skeleton.addJoint(root)
    skeleton.addJoint(mid)
    skeleton.addJoint(tip)

    const clip: BoneAnimationClip = {
        name: 'updown',
        duration: 1,
        loop: false,
        jointTracks: [{
            targetId: 'tip',
            interpolation: {type: 'bezier_quad', strategy: 'none'},
            records: [
                {time: 0, position: new Vector3(0, 1, 0), rotation: new Quaternion()},
                {time: 1, position: new Vector3(1, 1, 0), rotation: new Quaternion()},
            ],
        }],
        boneTracks: [],
        eventTracks: [{records: [{time: 0.5, eventName: 'mid_event'}]}],
    }
    return {skeleton, clip}
}

describe('播放器推进', () => {
    it('updater 推进 time 并写入骨架（applyPose）', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.play()
        player.updater(0.5)
        expect(player.time).toBeCloseTo(0.5)
        expect(player.isPlaying).toBe(true)
        /* tip 局部位置插值到 (0.5, 1, 0)，世界位置随之变化 */
        expect(skeleton.getWorldPosition('tip')!.x).toBeCloseTo(0.5)
    })

    it('未 play 时 updater 不推进', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.updater(0.5)
        expect(player.time).toBe(0)
    })

    it('pause 暂停、play 恢复', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.play()
        player.updater(0.3)
        player.pause()
        player.updater(0.3)
        expect(player.time).toBeCloseTo(0.3)
        player.play()
        player.updater(0.3)
        expect(player.time).toBeCloseTo(0.6)
    })
})

describe('循环与非循环', () => {
    it('非循环播完停止并回调 onFinished（仅一次）', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        let finished = 0
        player.onFinished = () => { finished += 1 }
        player.play()
        player.updater(0.6)
        player.updater(0.6)
        expect(player.isPlaying).toBe(false)
        expect(player.time).toBe(clip.duration)
        expect(finished).toBe(1)
        player.updater(0.6)
        expect(finished).toBe(1)
    })

    it('循环播放 time 取模回绕', () => {
        const {skeleton} = makeRig()
        const clip: BoneAnimationClip = {...makeRig().clip, loop: true}
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.play()
        player.updater(0.7)
        player.updater(0.7)
        expect(player.time).toBeCloseTo(0.4)
    })

    it('非循环播完后 play() 从头重放', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.play()
        player.updater(1.2)
        expect(player.isPlaying).toBe(false)
        player.play()
        expect(player.isPlaying).toBe(true)
        player.updater(0.2)
        expect(player.time).toBeCloseTo(0.2)
    })
})

describe('seek / setSpeed', () => {
    it('seek 定位并立即应用姿态', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.seek(0.5)
        expect(player.time).toBeCloseTo(0.5)
        expect(skeleton.getWorldPosition('tip')!.x).toBeCloseTo(0.5)
    })

    it('seek 越界夹取；循环时取模', () => {
        const {skeleton, clip} = makeRig()
        const loopClip: BoneAnimationClip = {...clip, loop: true, duration: 1}
        const nonLoop = createBoneAnimationPlayer(skeleton, clip)
        nonLoop.seek(5)
        expect(nonLoop.time).toBe(clip.duration)
        const looped = createBoneAnimationPlayer(skeleton, loopClip)
        looped.seek(1.5)
        expect(looped.time).toBeCloseTo(0.5)
    })

    it('setSpeed 整体变速', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.setSpeed(2)
        player.play()
        player.updater(0.5)
        expect(player.time).toBeCloseTo(1)
    })

    it('setSpeed 拒绝负值', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        player.setSpeed(-1)
        player.play()
        player.updater(0.5)
        expect(player.time).toBeCloseTo(0)
    })
})

describe('事件触发', () => {
    it('t=0 事件在 play 从头播放时触发（左开右闭区间覆盖不到）', () => {
        const {skeleton, clip} = makeRig()
        const startClip: BoneAnimationClip = {
            ...clip,
            eventTracks: [{records: [
                {time: 0, eventName: 'start_event'},
                {time: 0.5, eventName: 'mid_event'},
            ]}],
        }
        const player = createBoneAnimationPlayer(skeleton, startClip)
        const fired: string[] = []
        player.onEvent = r => fired.push(r.eventName)
        player.play()
        expect(fired).toContain('start_event')
        player.updater(0.5)
        expect(fired).toEqual(['start_event', 'mid_event'])
    })

    it('循环播放恰落在周期边界时补发 t=0 事件', () => {
        const {skeleton, clip} = makeRig()
        const loopClip: BoneAnimationClip = {
            ...clip,
            loop: true,
            eventTracks: [{records: [{time: 0, eventName: 'cycle_start'}]}],
        }
        const player = createBoneAnimationPlayer(skeleton, loopClip)
        const fired: string[] = []
        player.onEvent = r => fired.push(r.eventName)
        player.play()
        expect(fired).toHaveLength(1)
        /* 0.5 + 0.5 = 1.0 恰为周期边界 */
        player.updater(0.5)
        player.updater(0.5)
        expect(fired.filter(e => e === 'cycle_start')).toHaveLength(2)
    })

    it('单步跨越多个周期时逐周期触发，不遗漏中间周期事件', () => {
        const {skeleton, clip} = makeRig()
        const loopClip: BoneAnimationClip = {
            ...clip,
            loop: true,
            duration: 1,
            eventTracks: [{records: [{time: 0.4, eventName: 'per_cycle'}]}],
        }
        const player = createBoneAnimationPlayer(skeleton, loopClip)
        const fired: string[] = []
        player.onEvent = r => fired.push(r.eventName)
        player.play()
        /* 从 0 一次推进 2.2s：跨 2 个完整周期 + 0.2 尾段，每个周期的 0.4 事件都应触发 */
        player.updater(2.2)
        expect(fired.filter(e => e === 'per_cycle')).toHaveLength(2)
        expect(player.time).toBeCloseTo(0.2)
    })

    it('onEvent 增量触发区间内事件（不重不漏）', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        const fired: BoneEventRecord[] = []
        player.onEvent = r => fired.push(r)
        player.play()
        player.updater(0.2)   /* (0, 0.2] 无事件 */
        player.updater(0.4)   /* (0.2, 0.6] → 0.5 事件 */
        expect(fired).toHaveLength(1)
        expect(fired[0].eventName).toBe('mid_event')
        player.updater(0.6)   /* (0.6, 1.2] 无新事件 */
        expect(fired).toHaveLength(1)
    })

    it('循环跨边界时事件分两段触发（不遗漏）', () => {
        const {skeleton, clip} = makeRig()
        const loopClip: BoneAnimationClip = {
            ...clip,
            loop: true,
            eventTracks: [{records: [{time: 0.9, eventName: 'near_end'}]}],
        }
        const player = createBoneAnimationPlayer(skeleton, loopClip)
        const fired: string[] = []
        player.onEvent = r => fired.push(r.eventName)
        player.play()
        player.updater(0.85)   /* time → 0.85，无事件 */
        player.updater(0.2)    /* 0.85 → 0.05 跨边界 → (0.85,1] + (0,0.05] → 0.9 事件 */
        expect(fired).toContain('near_end')
    })

    it('seek 不触发事件', () => {
        const {skeleton, clip} = makeRig()
        const player = createBoneAnimationPlayer(skeleton, clip)
        let fired = 0
        player.onEvent = () => { fired += 1 }
        player.seek(0.6)
        expect(fired).toBe(0)
    })
})