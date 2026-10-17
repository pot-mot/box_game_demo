import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {captureBoneRoll, captureJointPose, captureSourceId} from './mirror_capture.ts'

/** 惯用手预览下的关键帧采集映射：读取镜像关节、姿势反射回 canonical */
describe('惯用手预览采集映射（mirror_capture）', () => {
    it('采集源 id：镜像时左右互换，非镜像时原样（中性 id 不变）', () => {
        expect(captureSourceId('leftArmElbow', false)).toBe('leftArmElbow')
        expect(captureSourceId('leftArmElbow', true)).toBe('rightArmElbow')
        expect(captureSourceId('rightWeaponMount', true)).toBe('leftWeaponMount')
        expect(captureSourceId('spine', true)).toBe('spine')
    })

    it('关节姿势反射：位置 x 取反、旋转 (x, -y, -z, w)；非镜像时原样克隆', () => {
        const position = new Vector3(1, 2, 3)
        const rotation = new Quaternion(0.2, 0.3, 0.4, 0.5)
        const mirrored = captureJointPose(position, rotation, true)
        expect(mirrored.position.toArray()).toEqual([-1, 2, 3])
        expect([mirrored.rotation.x, mirrored.rotation.y, mirrored.rotation.z, mirrored.rotation.w])
            .toEqual([0.2, -0.3, -0.4, 0.5])
        /* 反射为对合：再反射一次回到原值 */
        const back = captureJointPose(mirrored.position, mirrored.rotation, true)
        expect(back.position.toArray()).toEqual([1, 2, 3])

        const plain = captureJointPose(position, rotation, false)
        expect(plain.position.toArray()).toEqual([1, 2, 3])
        expect([plain.rotation.x, plain.rotation.y, plain.rotation.z, plain.rotation.w])
            .toEqual([0.2, 0.3, 0.4, 0.5])
    })

    it('骨骼段扭转角：镜像取反（反射反转扭转手性）', () => {
        expect(captureBoneRoll(0.7, true)).toBeCloseTo(-0.7)
        expect(captureBoneRoll(0.7, false)).toBeCloseTo(0.7)
    })
})
