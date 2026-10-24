import {describe, expect, it} from 'vitest'
import {Euler, Quaternion, Vector3} from 'three'
import {bakeClip} from '../../../../../skeleton/anim/bake.ts'
import {createProgressClipLeaf} from './progress_clip_leaf.ts'

const clip = bakeClip('test', 1, false, ['a'], t => new Map([
    ['a', {
        position: new Vector3(0, 0, 0),
        rotation: new Quaternion().setFromEuler(new Euler(t * Math.PI / 2, 0, 0)),
    }],
]))

describe('createProgressClipLeaf', () => {
    it('progress 映射到 clip 采样时间', () => {
        const leaf = createProgressClipLeaf('leaf', clip)
        const pose = leaf.sample(0.5, {})
        const joint = pose.a
        expect(joint).toBeDefined()
        const rotation = joint === undefined ? undefined : 'rotation' in joint ? joint.rotation : joint
        expect(rotation?.[0]).toBeCloseTo(Math.PI / 4, 2)
    })

    it('按 joints 过滤叶子覆盖', () => {
        const multi = bakeClip('multi', 1, false, ['a', 'b'], t => new Map([
            ['a', {position: new Vector3(), rotation: new Quaternion().setFromEuler(new Euler(t, 0, 0))}],
            ['b', {position: new Vector3(), rotation: new Quaternion().setFromEuler(new Euler(0, t, 0))}],
        ]))
        const leaf = createProgressClipLeaf('leaf', multi, {joints: ['b']})
        expect(leaf.joints).toEqual(['b'])
        expect(leaf.sample(0.5, {}).a).toBeUndefined()
        expect(leaf.sample(0.5, {}).b).toBeDefined()
    })

    it('事件转换为 progress', () => {
        const withEvents = {
            ...clip,
            eventTracks: [{records: [{time: 0.25, eventName: 'hitbox_on'}, {time: 0.75, eventName: 'hitbox_off'}]}],
        }
        const leaf = createProgressClipLeaf('leaf', withEvents)
        expect(leaf.events).toEqual([
            {progress: 0.25, eventName: 'hitbox_on'},
            {progress: 0.75, eventName: 'hitbox_off'},
        ])
    })
})
