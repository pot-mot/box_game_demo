import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {cloneClip, keyframesToTracks, tracksToKeyframes} from './types.ts'
import type {BoneAnimationClip, BoneAnimationKeyframe} from './types.ts'

const pos = (x: number, y = 0, z = 0): Vector3 => new Vector3(x, y, z)

const makeKeyframes = (): readonly BoneAnimationKeyframe[] => [
    {
        time: 0.2,
        jointRecords: [{jointId: 'a', record: {time: 0.2, position: pos(0), rotation: new Quaternion()}}],
        boneRecords: [{boneId: 'b', record: {time: 0.2, roll: 0.1}}],
        events: [{time: 0.2, eventName: 'hitbox_on'}],
    },
    {
        time: 0.8,
        jointRecords: [{jointId: 'a', record: {time: 0.8, position: pos(1), rotation: new Quaternion()}}],
        boneRecords: [{boneId: 'b', record: {time: 0.8, roll: 0.9}}],
        events: [],
    },
    {
        time: 0.5,
        jointRecords: [{jointId: 'c', record: {time: 0.5, position: pos(3), rotation: new Quaternion()}}],
        boneRecords: [],
        events: [{time: 0.5, eventName: 'hitbox_off'}],
    },
]

describe('关键帧聚合 → 轨道（keyframesToTracks）', () => {
    it('按 targetId 分组并按 time 升序排序', () => {
        const {jointTracks, boneTracks} = keyframesToTracks(makeKeyframes())
        expect(jointTracks.map(t => t.targetId).sort()).toEqual(['a', 'c'])
        const trackA = jointTracks.find(t => t.targetId === 'a')!
        expect(trackA.records.map(r => r.time)).toEqual([0.2, 0.8])
        const trackB = boneTracks.find(t => t.targetId === 'b')!
        expect(trackB.records.map(r => r.time)).toEqual([0.2, 0.8])
    })

    it('插值规格默认取 DEFAULT_TRACK_INTERPOLATION，可被映射覆盖', () => {
        const {jointTracks} = keyframesToTracks(makeKeyframes())
        for (const track of jointTracks) {
            expect(track.interpolation.type).toBe('bezier_quad')
            expect(track.interpolation.strategy).toBe('none')
        }
        const override = new Map<string, {type: 'linear'; strategy: 'none'}>([['a', {type: 'linear', strategy: 'none'}]])
        const {jointTracks: overridden} = keyframesToTracks(makeKeyframes(), override)
        expect(overridden.find(t => t.targetId === 'a')!.interpolation.type).toBe('linear')
        expect(overridden.find(t => t.targetId === 'c')!.interpolation.type).toBe('bezier_quad')
    })

    it('同一目标同一时间的多条记录保留最后一条', () => {
        const kfs = [
            {time: 0.5, jointRecords: [{jointId: 'a', record: {time: 0.5, position: pos(1), rotation: new Quaternion()}}], boneRecords: [], events: []},
            {time: 0.5, jointRecords: [{jointId: 'a', record: {time: 0.5, position: pos(9), rotation: new Quaternion()}}], boneRecords: [], events: []},
        ]
        const {jointTracks} = keyframesToTracks(kfs)
        expect(jointTracks[0].records).toHaveLength(1)
        expect(jointTracks[0].records[0].position.x).toBe(9)
    })

    it('事件归并为单一事件轨并排序', () => {
        const {eventTracks} = keyframesToTracks(makeKeyframes())
        expect(eventTracks).toHaveLength(1)
        expect(eventTracks[0].records.map(r => r.time)).toEqual([0.2, 0.5])
    })
})

describe('clip 深拷贝（cloneClip）', () => {
    const makeClip = (): BoneAnimationClip => ({
        name: 'src',
        duration: 1,
        loop: true,
        jointTracks: [
            {targetId: 'spine', interpolation: {type: 'bezier_quad', strategy: 'none'}, records: [
                {time: 0, position: new Vector3(0, 0.5, 0), rotation: new Quaternion()},
                {time: 1, position: new Vector3(0, 0.5, 0.1), rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5)},
            ]},
        ],
        boneTracks: [
            {targetId: 'torso', interpolation: {type: 'linear', strategy: 'none'}, records: [{time: 0, roll: 0.3}]},
        ],
        eventTracks: [{records: [{time: 0.2, eventName: 'hitbox_on'}]}],
    })

    it('记录的位置/旋转与原 clip 数值一致但对象独立', () => {
        const clip = makeClip()
        const copy = cloneClip(clip)
        expect(copy.jointTracks[0].records).toHaveLength(2)
        expect(copy.jointTracks[0].records[1].rotation.angleTo(clip.jointTracks[0].records[1].rotation)).toBeLessThan(1e-6)
        expect(copy.jointTracks[0].records[0].position).not.toBe(clip.jointTracks[0].records[0].position)
        expect(copy.jointTracks[0].records[0].rotation).not.toBe(clip.jointTracks[0].records[0].rotation)
    })

    it('数组独立：修改副本记录不影响源 clip', () => {
        const clip = makeClip()
        const copy = cloneClip(clip)
        copy.jointTracks[0].records[0].position.x = 99
        expect(clip.jointTracks[0].records[0].position.x).toBe(0)
        expect(copy.jointTracks).not.toBe(clip.jointTracks)
        expect(copy.jointTracks[0].records).not.toBe(clip.jointTracks[0].records)
        expect(copy.boneTracks[0].records).not.toBe(clip.boneTracks[0].records)
        expect(copy.eventTracks[0].records).not.toBe(clip.eventTracks[0].records)
    })

    it('时长/循环/插值规格保留', () => {
        const clip = makeClip()
        const copy = cloneClip(clip)
        expect(copy.duration).toBe(clip.duration)
        expect(copy.loop).toBe(clip.loop)
        expect(copy.jointTracks[0].interpolation).toEqual(clip.jointTracks[0].interpolation)
    })
})

describe('轨道 → 关键帧聚合（tracksToKeyframes）', () => {
    it('按时间归并全部轨道与事件，按 time 升序输出', () => {
        const clip: BoneAnimationClip = {
            name: 'test',
            duration: 1,
            loop: false,
            jointTracks: [
                {targetId: 'a', interpolation: {type: 'linear', strategy: 'none'}, records: [
                    {time: 0.8, position: pos(1), rotation: new Quaternion()},
                    {time: 0.2, position: pos(0), rotation: new Quaternion()},
                ]},
            ],
            boneTracks: [
                {targetId: 'b', interpolation: {type: 'linear', strategy: 'none'}, records: [{time: 0.2, roll: 0.1}]},
            ],
            eventTracks: [{records: [{time: 0.5, eventName: 'hitbox_off'}]}],
        }
        const kfs = tracksToKeyframes(clip)
        expect(kfs.map(k => k.time)).toEqual([0.2, 0.5, 0.8])
        expect(kfs[0].jointRecords).toHaveLength(1)
        expect(kfs[0].boneRecords).toHaveLength(1)
        expect(kfs[1].events[0].eventName).toBe('hitbox_off')
    })

    it('与 keyframesToTracks 往返：记录数量与值一致', () => {
        const kfs = makeKeyframes()
        const {jointTracks, boneTracks, eventTracks} = keyframesToTracks(kfs)
        const clip: BoneAnimationClip = {
            name: 'rt',
            duration: 1,
            loop: false,
            jointTracks,
            boneTracks,
            eventTracks,
        }
        const back = tracksToKeyframes(clip)
        expect(back).toHaveLength(kfs.length)
        for (const kf of back) {
            const original = kfs.find(k => k.time === kf.time)
            expect(original).toBeDefined()
            for (const {jointId, record} of kf.jointRecords) {
                const orig = original!.jointRecords.find(r => r.jointId === jointId)
                expect(orig).toBeDefined()
                expect(record.position.distanceTo(orig!.record.position)).toBeLessThan(1e-6)
            }
            for (const {boneId, record} of kf.boneRecords) {
                const orig = original!.boneRecords.find(r => r.boneId === boneId)
                expect(orig!.record.roll).toBe(record.roll)
            }
        }
    })
})