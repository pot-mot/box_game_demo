import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {createTargetIdMapping, remapClipTargets} from './retarget.ts'
import type {BoneAnimationClip} from './types.ts'

const makeClip = (): BoneAnimationClip => ({
    name: 'demo',
    duration: 1,
    loop: false,
    jointTracks: [
        {targetId: 'group', interpolation: {type: 'linear', strategy: 'none'}, records: [
            {time: 0, position: new Vector3(0, 0, 0), rotation: new Quaternion()},
            {time: 1, position: new Vector3(0, 1, 0), rotation: new Quaternion()},
        ]},
        {targetId: 'spine', interpolation: {type: 'linear', strategy: 'none'}, records: [
            {time: 0, position: new Vector3(0, 0.5, 0), rotation: new Quaternion()},
        ]},
    ],
    boneTracks: [
        {targetId: 'torso', interpolation: {type: 'linear', strategy: 'none'}, records: [{time: 0, roll: 0.2}]},
    ],
    eventTracks: [{records: [{time: 0.1, eventName: 'hitbox_on'}]}],
})

describe('clip 轨道目标重定向（remapClipTargets）', () => {
    it('按映射改写关节轨与骨骼段轨的目标 id', () => {
        const next = remapClipTargets(makeClip(), createTargetIdMapping({group: 'root'}))
        expect(next.jointTracks.map(t => t.targetId)).toEqual(['root', 'spine'])
        expect(next.boneTracks[0].targetId).toBe('torso')
    })

    it('未在映射中的目标 id 原样保留', () => {
        const next = remapClipTargets(makeClip(), createTargetIdMapping({other: 'x'}))
        expect(next.jointTracks.map(t => t.targetId)).toEqual(['group', 'spine'])
    })

    it('空映射返回原 clip 对象（无谓拷贝）', () => {
        const clip = makeClip()
        expect(remapClipTargets(clip, new Map())).toBe(clip)
    })

    it('记录、时长、循环与事件轨原样保留，且未修改源 clip', () => {
        const clip = makeClip()
        const next = remapClipTargets(clip, createTargetIdMapping({group: 'root'}))
        expect(next.duration).toBe(clip.duration)
        expect(next.loop).toBe(clip.loop)
        expect(next.eventTracks).toBe(clip.eventTracks)
        expect(next.jointTracks[0].records).toBe(clip.jointTracks[0].records)
        expect(next.jointTracks[0].interpolation).toBe(clip.jointTracks[0].interpolation)
        /* 源 clip 未被改动 */
        expect(clip.jointTracks[0].targetId).toBe('group')
    })
})
