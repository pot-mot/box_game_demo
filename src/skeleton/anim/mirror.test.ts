import {describe, it, expect} from 'vitest'
import {Euler, Matrix4, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip} from './types.ts'
import {conjugateQuaternion, mirrorClip, mirrorJointId, reflectPosition} from './mirror.ts'

/** 以矩阵 `S·R·S`（S = diag(-1,1,1)）直算跨 X=0 平面的旋转共轭，作为镜像公式的独立参考 */
const conjugateByMatrix = (q: Quaternion): Quaternion => {
    const reflect = new Matrix4().makeScale(-1, 1, 1)
    const r = new Matrix4().makeRotationFromQuaternion(q)
    const m = reflect.clone().multiply(r).multiply(reflect)
    return new Quaternion().setFromRotationMatrix(m)
}

const eulerQuat = (x: number, y: number, z: number): Quaternion =>
    new Quaternion().setFromEuler(new Euler(x, y, z))

describe('镜像原语：四元数反射共轭', () => {
    it('(x, y, z, w) → (x, -y, -z, w)', () => {
        const q = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize()
        const c = conjugateQuaternion(q)
        expect(c.x).toBeCloseTo(q.x)
        expect(c.y).toBeCloseTo(-q.y)
        expect(c.z).toBeCloseTo(-q.z)
        expect(c.w).toBeCloseTo(q.w)
    })

    it('与矩阵 S·R·S 结果一致（多种欧拉输入）', () => {
        const samples: [number, number, number][] = [
            [0.3, 0, 0],
            [0, 0.4, 0],
            [0, 0, 0.5],
            [0.2, 0.6, -0.3],
            [-0.7, 0.25, 0.9],
        ]
        for (const [x, y, z] of samples) {
            const q = eulerQuat(x, y, z)
            expect(conjugateQuaternion(q).angleTo(conjugateByMatrix(q))).toBeLessThan(1e-6)
        }
    })

    it('对 ry / rz 的反射等价于取反（欧拉级）', () => {
        const q = eulerQuat(0.35, 0.8, -0.55)
        expect(conjugateQuaternion(q).angleTo(eulerQuat(0.35, -0.8, 0.55))).toBeLessThan(1e-6)
    })
})

describe('镜像原语：位置反射与 id 互换', () => {
    it('位置 x 取反', () => {
        const p = reflectPosition(new Vector3(0.145, 0.5, -0.2))
        expect(p.x).toBeCloseTo(-0.145)
        expect(p.y).toBeCloseTo(0.5)
        expect(p.z).toBeCloseTo(-0.2)
    })

    it('左右词缀互换，中枢关节原样', () => {
        expect(mirrorJointId('rightArmShoulder')).toBe('leftArmShoulder')
        expect(mirrorJointId('leftLegKnee')).toBe('rightLegKnee')
        expect(mirrorJointId('rightWeaponMount')).toBe('leftWeaponMount')
        expect(mirrorJointId('spine')).toBe('spine')
        expect(mirrorJointId('headNeck')).toBe('headNeck')
        expect(mirrorJointId('backWeaponMount')).toBe('backWeaponMount')
    })
})

describe('镜像原语：clip 镜像', () => {
    const clip: BoneAnimationClip = {
        name: 'test',
        duration: 1,
        loop: false,
        jointTracks: [
            {
                targetId: 'rightArmShoulder',
                interpolation: {type: 'linear'},
                records: [{
                    time: 0,
                    position: new Vector3(-0.145, 0.5, 0),
                    rotation: eulerQuat(0.3, 0.4, 0.5),
                }],
            },
        ],
        boneTracks: [
            {targetId: 'rightForearm', interpolation: {type: 'linear'}, records: [{time: 0, roll: 0.25}]},
        ],
        eventTracks: [{records: [{time: 0.5, eventName: 'hit'}]}],
    }

    it('关节轨换到对侧并共轭记录', () => {
        const mirrored = mirrorClip(clip)
        const track = mirrored.jointTracks[0]
        expect(track.targetId).toBe('leftArmShoulder')
        expect(track.records[0].position.x).toBeCloseTo(0.145)
        expect(track.records[0].rotation.angleTo(eulerQuat(0.3, -0.4, -0.5))).toBeLessThan(1e-6)
    })

    it('骨骼段轨换侧并取反 roll；事件轨原样', () => {
        const mirrored = mirrorClip(clip)
        expect(mirrored.boneTracks[0].targetId).toBe('leftForearm')
        expect(mirrored.boneTracks[0].records[0].roll).toBeCloseTo(-0.25)
        expect(mirrored.eventTracks[0].records[0].eventName).toBe('hit')
        expect(mirrored.eventTracks[0].records[0].time).toBe(0.5)
    })

    it('镜像两次回到自身（对合）', () => {
        const twice = mirrorClip(mirrorClip(clip))
        expect(twice.jointTracks[0].targetId).toBe(clip.jointTracks[0].targetId)
        expect(twice.jointTracks[0].records[0].rotation.angleTo(clip.jointTracks[0].records[0].rotation)).toBeLessThan(1e-6)
        expect(twice.jointTracks[0].records[0].position.x).toBeCloseTo(clip.jointTracks[0].records[0].position.x)
        expect(twice.boneTracks[0].records[0].roll).toBeCloseTo(0.25)
    })
})
