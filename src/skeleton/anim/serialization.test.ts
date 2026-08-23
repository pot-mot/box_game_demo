import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {createSkeleton} from '../skeleton.ts'
import {createSkeletonJoint, connectJoint} from '../joint.ts'
import {createSkeletonBone} from '../bone.ts'
import {serializeAsset, parseAsset, skeletonToDefinition, skeletonFromDefinition} from './serialization.ts'
import type {SkeletonAnimationAsset} from './serialization.ts'
import type {BoneAnimationClip} from './types.ts'

/** 构建人形简化骨架（带 IK 根标记） */
const buildSkeleton = (): ReturnType<typeof createSkeleton> => {
    const skeleton = createSkeleton()
    const spine = createSkeletonJoint('spine', 'spine')
    const shoulder = createSkeletonJoint('shoulder', 'shoulder')
    const elbow = createSkeletonJoint('elbow', 'elbow')
    connectJoint(spine, shoulder)
    connectJoint(shoulder, elbow)
    shoulder.position.set(0.3, 0.4, 0)
    elbow.position.set(0, -0.3, 0)
    shoulder.ikRootLevel = 0
    skeleton.addJoint(spine)
    skeleton.addJoint(shoulder)
    skeleton.addJoint(elbow)
    skeleton.addBone(createSkeletonBone('upper_arm', shoulder, elbow, 0.3, 'upper_arm'))
    return skeleton
}

const makeClip = (): BoneAnimationClip => ({
    name: 'wave',
    duration: 1.5,
    loop: true,
    jointTracks: [{
        targetId: 'elbow',
        interpolation: {type: 'bezier_quad', strategy: 'ease_out'},
        records: [
            {time: 0, position: new Vector3(0, 0, 0), rotation: new Quaternion()},
            {time: 1.5, position: new Vector3(0.1, 0.2, 0.3), rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1)},
        ],
    }],
    boneTracks: [{
        targetId: 'upper_arm',
        interpolation: {type: 'bezier_quad', strategy: 'none'},
        records: [
            {time: 0, roll: 0},
            {time: 1.5, roll: 0.8},
        ],
    }],
    eventTracks: [{records: [{time: 0.6, eventName: 'hitbox_on', params: {weapon: 'sword', level: 2}}]}],
})

const makeAsset = (): SkeletonAnimationAsset => ({
    formatVersion: 1,
    skeleton: skeletonToDefinition(buildSkeleton()),
    animations: [makeClip()],
})

describe('资产序列化/解析', () => {
    it('JSON 往返：骨骼定义 + 动画库完整一致', () => {
        const asset = makeAsset()
        const parsed = parseAsset(serializeAsset(asset))
        expect(parsed.formatVersion).toBe(1)
        expect(parsed.skeleton.joints).toHaveLength(3)
        expect(parsed.skeleton.bones).toHaveLength(1)
        expect(parsed.animations).toHaveLength(1)

        const clip = parsed.animations[0]
        expect(clip.name).toBe('wave')
        expect(clip.loop).toBe(true)
        const jointRecord = clip.jointTracks[0].records[1]
        expect(jointRecord.position.x).toBeCloseTo(0.1)
        expect(jointRecord.rotation.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1))).toBeLessThan(1e-6)
        expect(clip.boneTracks[0].records[1].roll).toBeCloseTo(0.8)
        expect(clip.eventTracks[0].records[0].params?.weapon).toBe('sword')
    })

    it('ikRootLevel 持久化', () => {
        const parsed = parseAsset(serializeAsset(makeAsset()))
        const shoulder = parsed.skeleton.joints.find(j => j.id === 'shoulder')!
        expect(shoulder.ikRootLevel).toBe(0)
        const spine = parsed.skeleton.joints.find(j => j.id === 'spine')!
        expect(spine.ikRootLevel).toBeUndefined()
    })

    it('非法 JSON 抛错', () => {
        expect(() => parseAsset('not json')).toThrow()
    })

    it('非法结构拒绝（动画缺 duration / 事件缺 eventName）', () => {
        expect(() => parseAsset(JSON.stringify({
            skeleton: {joints: [], bones: []},
            animations: [{name: 'x', loop: false}],
        }))).toThrow()
        expect(() => parseAsset(JSON.stringify({
            skeleton: {joints: [], bones: []},
            animations: [{name: 'x', duration: 1, eventTracks: [{records: [{time: 0}]}]}],
        }))).toThrow()
    })

    it('缺省字段兜底（formatVersion/loop/roll/轨道数组）', () => {
        const parsed = parseAsset(JSON.stringify({
            skeleton: {joints: []},
            animations: [{name: 'x', duration: 1}],
        }))
        expect(parsed.formatVersion).toBe(1)
        expect(parsed.animations[0].loop).toBe(false)
        expect(parsed.animations[0].jointTracks).toHaveLength(0)
        expect(parsed.skeleton.bones).toHaveLength(0)
    })
})

describe('骨架定义转换', () => {
    it('skeletonToDefinition → skeletonFromDefinition 往返：层级/位置/旋转/IK 根一致', () => {
        const original = buildSkeleton()
        original.updateWorldTransforms()
        const elbowWorldBefore = original.getWorldPosition('elbow')!.clone()

        const rebuilt = skeletonFromDefinition(skeletonToDefinition(original))
        rebuilt.updateWorldTransforms()

        expect(rebuilt.joints.size).toBe(original.joints.size)
        for (const [id, joint] of original.joints) {
            const rebuiltJoint = rebuilt.findJoint(id)!
            expect(rebuiltJoint.name).toBe(joint.name)
            expect(rebuiltJoint.position.distanceTo(joint.position)).toBeLessThan(1e-6)
            expect(rebuiltJoint.rotation.angleTo(joint.rotation)).toBeLessThan(1e-6)
            expect(rebuiltJoint.ikRootLevel).toBe(joint.ikRootLevel)
            expect(rebuiltJoint.parent?.id).toBe(joint.parent?.id)
        }
        for (const [id, bone] of original.bones) {
            const rebuiltBone = rebuilt.findBone(id)!
            expect(rebuiltBone.length).toBeCloseTo(bone.length)
            expect(rebuiltBone.roll).toBeCloseTo(bone.roll)
            expect(rebuiltBone.head.id).toBe(bone.head.id)
            expect(rebuiltBone.tail.id).toBe(bone.tail.id)
        }
        /* 世界位置一致 */
        expect(rebuilt.getWorldPosition('elbow')!.distanceTo(elbowWorldBefore)).toBeLessThan(1e-6)
    })

    it('parentId 引用未定义时抛错', () => {
        expect(() => skeletonFromDefinition({
            joints: [{id: 'a', name: 'a', parentId: 'missing', position: [0, 0, 0], rotation: [0, 0, 0, 1]}],
            bones: [],
        })).toThrow()
    })
})