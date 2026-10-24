import {describe, it, expect} from 'vitest'
import {compileAuthoredAttackClip} from './authored_attack.ts'
import {buildWolfSkeleton} from '../../wolf/skeleton/skeleton.ts'

describe('通用攻击作者数据编译', () => {
    it('只编译声明关节，未声明位置沿用骨架静止位置', () => {
        const skeleton = buildWolfSkeleton()
        const clip = compileAuthoredAttackClip('test', {
            duration: 1,
            times: [0, 1],
            joints: {head: [[0, 0, 0], [0.1, 0.2, 0.3]]},
        }, skeleton)

        expect(clip.jointTracks.map(track => track.targetId)).toEqual(['head'])
        const restHead = skeleton.joints.find(joint => joint.id === 'head')
        expect(restHead).toBeDefined()
        expect(clip.jointTracks[0]!.records[0]!.position.toArray()).toEqual([...restHead!.position])
        expect(clip.jointTracks[0]!.records[1]!.position.toArray()).toEqual([...restHead!.position])
    })

    it('位置覆盖按时间栅格写入', () => {
        const clip = compileAuthoredAttackClip('test', {
            duration: 1,
            times: [0, 1],
            joints: {body: [[0, 0, 0], [0, 0, 0]]},
            positions: {body: [[0, 0.5, 0], [0, 0.6, 0.1]]},
        }, buildWolfSkeleton())

        expect(clip.jointTracks[0]!.records.map(record => record.position.toArray())).toEqual([
            [0, 0.5, 0],
            [0, 0.6, 0.1],
        ])
    })

    it('拒绝未知关节与长度不一致的时间栅格', () => {
        const skeleton = buildWolfSkeleton()
        expect(() => compileAuthoredAttackClip('test', {
            duration: 1,
            times: [0, 1],
            joints: {notAJoint: [[0, 0, 0], [0, 0, 0]]},
        }, skeleton)).toThrow(/不存在的关节/)

        expect(() => compileAuthoredAttackClip('test', {
            duration: 1,
            times: [0, 1],
            joints: {head: [[0, 0, 0]]},
        }, skeleton)).toThrow(/关键帧数量/)
    })

    it('作者事件编译为 slotKey 参数', () => {
        const clip = compileAuthoredAttackClip('test', {
            duration: 1,
            times: [0],
            joints: {head: [[0, 0, 0]]},
            events: [{time: 0.5, name: 'hitbox_on', slotKey: 'weapon:main_hand'}],
        }, buildWolfSkeleton())

        expect(clip.eventTracks[0]!.records[0]).toEqual({
            time: 0.5,
            eventName: 'hitbox_on',
            params: {slotKey: 'weapon:main_hand'},
        })
    })
})
