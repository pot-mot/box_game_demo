import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {createAnimationStore} from './animation_store.ts'
import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'

const makeClip = (name: string, x = 0): BoneAnimationClip => ({
    name,
    duration: 1,
    loop: false,
    jointTracks: [
        {targetId: 'spine', interpolation: {type: 'linear', strategy: 'none'}, records: [
            {time: 0, position: new Vector3(x, 0, 0), rotation: new Quaternion()},
            {time: 1, position: new Vector3(x, 1, 0), rotation: new Quaternion()},
        ]},
    ],
    boneTracks: [],
    eventTracks: [{records: [{time: 0.5, eventName: 'hitbox_on'}]}],
})

describe('动画库存储（createAnimationStore）', () => {
    it('新建空动画并去重命名', () => {
        const store = createAnimationStore()
        expect(store.createEmpty('动画').name).toBe('动画')
        expect(store.createEmpty('动画').name).toBe('动画_2')
        expect(store.currentName).toBe('动画_2')
    })

    it('导入动画：入库并选中', () => {
        const store = createAnimationStore()
        const imported = store.importClip(makeClip('行走（空手）'))
        expect(imported.name).toBe('行走（空手）')
        expect(store.currentName).toBe('行走（空手）')
        expect(store.current).toBe(imported)
    })

    it('导入重名动画自动加后缀', () => {
        const store = createAnimationStore()
        store.importClip(makeClip('行走（空手）'))
        expect(store.importClip(makeClip('行走（空手）')).name).toBe('行走（空手）_2')
    })

    it('导入为深拷贝：修改副本与源 clip 互不影响', () => {
        const source = makeClip('待机', 5)
        const store = createAnimationStore()
        const imported = store.importClip(source)
        expect(imported.jointTracks[0].records[0].position).not.toBe(source.jointTracks[0].records[0].position)
        imported.jointTracks[0].records[0].position.x = 99
        expect(source.jointTracks[0].records[0].position.x).toBe(5)
    })

    it('导入不改变源 clip 的名字与记录', () => {
        const source = makeClip('待机', 5)
        const store = createAnimationStore()
        store.importClip(source)
        store.importClip(source)
        expect(source.name).toBe('待机')
        expect(source.jointTracks[0].records[0].position.x).toBe(5)
        expect([...store.clips.keys()]).toEqual(['待机', '待机_2'])
    })

    it('导入后可继续用 updateCurrent 编辑并更新 meta', () => {
        const store = createAnimationStore()
        store.importClip(makeClip('行走'))
        store.updateMeta({duration: 2, loop: true})
        expect(store.current?.duration).toBe(2)
        expect(store.current?.loop).toBe(true)
        const next = store.updateCurrent(clip => ({...clip, duration: 3}))
        expect(next?.duration).toBe(3)
    })
})
