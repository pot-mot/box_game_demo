import {describe, it, expect} from 'vitest'
import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointTrack} from './types.ts'
import {composePoses, type PoseLayer} from './composition.ts'

/** 构造单关节双关键帧 clip：0 帧为单位姿态，末帧为指定旋转（时长固定 1s，不循环） */
const clipOf = (jointId: string, rotation: {x: number; y: number; z: number}, position = new Vector3()): BoneAnimationClip => {
    const quat = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z))
    const track: BoneJointTrack = {
        targetId: jointId,
        interpolation: {type: 'bezier_quad', strategy: 'none'},
        records: [
            {time: 0, position: position.clone(), rotation: new Quaternion()},
            {time: 1, position: position.clone(), rotation: quat},
        ],
    }
    return {name: jointId, duration: 1, loop: false, jointTracks: [track], boneTracks: [], eventTracks: []}
}

const layer = (clip: BoneAnimationClip, weight: number, progress = 1): PoseLayer => ({clip, weight, progress})

const eulerQuat = (x: number): Quaternion => new Quaternion().setFromEuler(new Euler(x, 0, 0))

describe('骨骼动画组合（composePoses，按关节归一化加权平均）', () => {
    it('关节不重叠的两层：并集覆盖，各自取自身采样值', () => {
        const upper = clipOf('rightArmShoulder', {x: 1, y: 0, z: 0})
        const lower = clipOf('rightLegHip', {x: 0.5, y: 0, z: 0})
        const pose = composePoses([layer(upper, 1), layer(lower, 1)])
        expect(pose.jointPoses.get('rightArmShoulder')!.rotation.angleTo(eulerQuat(1))).toBeLessThan(1e-5)
        expect(pose.jointPoses.get('rightLegHip')!.rotation.angleTo(eulerQuat(0.5))).toBeLessThan(1e-5)
    })

    it('重叠关节：按权重归一化加权（0.75/0.25 → 角度 1 向 0 插值 0.25 = 0.75）', () => {
        const a = clipOf('rightArmShoulder', {x: 1, y: 0, z: 0})
        const b = clipOf('rightArmShoulder', {x: 0, y: 0, z: 0})
        const pose = composePoses([layer(a, 0.75), layer(b, 0.25)])
        expect(pose.jointPoses.get('rightArmShoulder')!.rotation.angleTo(eulerQuat(0.75))).toBeLessThan(1e-4)
    })

    it('结果与层顺序无关（归一化加权平均）', () => {
        const a = clipOf('spine', {x: 1, y: 0, z: 0})
        const b = clipOf('spine', {x: 0, y: 0, z: 0})
        const forward = composePoses([layer(a, 0.3), layer(b, 0.7)]).jointPoses.get('spine')!.rotation.x
        const reverse = composePoses([layer(b, 0.7), layer(a, 0.3)]).jointPoses.get('spine')!.rotation.x
        expect(forward).toBeCloseTo(reverse, 5)
    })

    it('权重 0 的层不参与（关节不被覆盖）', () => {
        const a = clipOf('headNeck', {x: 1, y: 0, z: 0})
        const pose = composePoses([layer(a, 0)])
        expect(pose.jointPoses.has('headNeck')).toBe(false)
    })

    it('未被任何层覆盖的关节不出现在合成结果中（保留骨架既有姿态，支持任意拼装）', () => {
        const onlyArm = clipOf('rightArmShoulder', {x: 1, y: 0, z: 0})
        const pose = composePoses([layer(onlyArm, 1)])
        expect(pose.jointPoses.has('rightArmShoulder')).toBe(true)
        expect(pose.jointPoses.has('leftArmShoulder')).toBe(false)
        expect(pose.jointPoses.has('rightLegHip')).toBe(false)
    })
})
