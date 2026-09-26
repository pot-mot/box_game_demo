import {describe, it, expect} from 'vitest'
import {Euler, Quaternion, Vector3} from 'three'
import {createSkeleton} from '../skeleton.ts'
import {createSkeletonJoint} from '../joint.ts'
import type {BoneAnimationClip, BoneJointTrack} from './types.ts'
import {createComposedAnimationPlayer} from './composed_player.ts'

const jointTrack = (id: string, x: number): BoneJointTrack => ({
    targetId: id,
    interpolation: {type: 'bezier_quad', strategy: 'none'},
    records: [
        {time: 0, position: new Vector3(), rotation: new Quaternion()},
        {time: 1, position: new Vector3(), rotation: new Quaternion().setFromEuler(new Euler(x, 0, 0))},
    ],
})

const clipWith = (id: string, x: number, events: readonly {time: number; eventName: string}[]): BoneAnimationClip => ({
    name: id,
    duration: 1,
    loop: false,
    jointTracks: [jointTrack(id, x)],
    boneTracks: [],
    eventTracks: events.length > 0 ? [{records: events.map(e => ({time: e.time, eventName: e.eventName}))}] : [],
})

describe('组合播放器（createComposedAnimationPlayer）', () => {
    it('多层按关节分区合成并写入骨架', () => {
        const skeleton = createSkeleton()
        const upper = createSkeletonJoint('upper', 'upper')
        const lower = createSkeletonJoint('lower', 'lower')
        skeleton.addJoint(upper)
        skeleton.addJoint(lower)

        const player = createComposedAnimationPlayer(skeleton, [
            {clip: clipWith('upper', 1, []), weight: 1},
            {clip: clipWith('lower', 0.5, []), weight: 1},
        ])
        player.seekProgress(1)
        expect(skeleton.findJoint('upper')!.rotation.angleTo(new Quaternion().setFromEuler(new Euler(1, 0, 0)))).toBeLessThan(1e-5)
        expect(skeleton.findJoint('lower')!.rotation.angleTo(new Quaternion().setFromEuler(new Euler(0.5, 0, 0)))).toBeLessThan(1e-5)
    })

    it('事件按时间轴增量触发（左开右闭，各一次）', () => {
        const skeleton = createSkeleton()
        skeleton.addJoint(createSkeletonJoint('a', 'a'))
        const clip = clipWith('a', 1, [{time: 0.25, eventName: 'e1'}, {time: 0.75, eventName: 'e2'}])
        const player = createComposedAnimationPlayer(skeleton, [{clip, weight: 1}])
        const fired: string[] = []
        player.onEvent = record => fired.push(record.eventName)
        player.play()
        for (let i = 0; i < 12; i++) player.updater(0.1)
        expect(fired).toEqual(['e1', 'e2'])
    })

    it('非循环播完自停并回调 onFinished', () => {
        const skeleton = createSkeleton()
        skeleton.addJoint(createSkeletonJoint('a', 'a'))
        const player = createComposedAnimationPlayer(skeleton, [{clip: clipWith('a', 1, []), weight: 1}])
        let finished = 0
        player.onFinished = () => { finished++ }
        player.play()
        player.updater(2)
        expect(player.isPlaying).toBe(false)
        expect(finished).toBe(1)
    })
})
