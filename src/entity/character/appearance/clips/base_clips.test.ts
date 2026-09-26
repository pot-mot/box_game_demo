import {describe, it, expect, beforeAll, vi} from 'vitest'
import {Euler, Quaternion, Vector3} from 'three'
import {buildBaseClip, CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS} from './base_clips.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, type PoseState} from '../pose_fns.ts'
import {sampleClip} from '../../../../skeleton/anim/sampling.ts'
import {createCharacterSkeletonBridge} from '../skeleton_bridge.ts'
import {createCharacterModel} from '../model.ts'

/** happy-dom 无 2d 上下文：stub document.createElement 的 canvas.getContext（脸部纹理绘制用） */
const stubCanvas2d = (): void => {
    const fakeCtx = new Proxy({}, {
        get: (_t, prop) => {
            if (prop === 'canvas') return null
            return (): void => {}
        },
        set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = originalCreate(tag, options)
        if (tag === 'canvas') {
            Object.defineProperty(el, 'getContext', {value: () => fakeCtx})
        }
        return el
    })
}

/** 姿态欧拉 → 四元数（与 base_clips 相同的 XYZ 顺序） */
const quatOf = (state: PoseState, jointId: (typeof CHARACTER_JOINT_IDS)[number]): Quaternion => {
    const map: Record<(typeof CHARACTER_JOINT_IDS)[number], {rx: number; ry: number; rz: number}> = {
        rightArmShoulder: state.rightArmShoulder,
        rightArmElbow: state.rightArmElbow,
        rightWristPivot: state.rightWristPivot,
        leftArmShoulder: state.leftArmShoulder,
        leftArmElbow: state.leftArmElbow,
        rightLegHip: state.rightLegHip,
        rightLegKnee: state.rightLegKnee,
        leftLegHip: state.leftLegHip,
        leftLegKnee: state.leftLegKnee,
        headNeck: state.headNeck,
        spine: state.spine.rotation,
        root: state.root.rotation,
    }
    const e = map[jointId]
    return new Quaternion().setFromEuler(new Euler(e.rx, e.ry, e.rz))
}

const SAMPLES = [0.0, 0.013, 0.05, 0.123, 0.27, 0.5, 0.66, 0.83, 0.97, 1.0]

describe('基础状态 clip 生成器', () => {
    for (const state of Object.keys(BASE_CLIP_META) as (keyof typeof BASE_CLIP_META)[]) {
        it(`${state}：采样姿态与公式一致（插值误差 < 1.7°，拐点斜率突变处线性插值固有误差）`, () => {
            const meta = BASE_CLIP_META[state]
            const clip = buildBaseClip(state, false)
            expect(clip.duration).toBeCloseTo(meta.duration)
            expect(clip.loop).toBe(meta.loop)
            for (const ratio of SAMPLES) {
                const t = Math.min(meta.duration * ratio, meta.duration)
                /* 与采样语义对齐：循环取模、非循环 clamp */
                const refT = meta.loop && meta.duration > 0
                    ? ((t % meta.duration) + meta.duration) % meta.duration
                    : t
                const sampled = sampleClip(clip, t)
                const reference = BASE_POSE_SAMPLERS[state](refT, {weaponHeld: false, horizontalSpeed: 0})
                for (const jointId of CHARACTER_JOINT_IDS) {
                    const sampledQuat = sampled.jointPoses.get(jointId)?.rotation
                    expect(sampledQuat).toBeDefined()
                    const refQuat = quatOf(reference, jointId)
                    expect(sampledQuat!.angleTo(refQuat)).toBeLessThan(0.03)
                }
            }
        })
    }

    it('循环动画 wrap 无缝：首帧与末帧值一致（同频波形）', () => {
        for (const state of ['walking', 'falling', 'dashing'] as const) {
            const clip = buildBaseClip(state, false)
            const pose0 = sampleClip(clip, 0)
            const poseEnd = sampleClip(clip, clip.duration)
            for (const jointId of CHARACTER_JOINT_IDS) {
                const q0 = pose0.jointPoses.get(jointId)!.rotation
                const qe = poseEnd.jointPoses.get(jointId)!.rotation
                expect(q0.angleTo(qe)).toBeLessThan(1e-3)
            }
        }
    })

    it('持械变体：idle/walking 持械 clip 与空手 clip 肩肘姿态不同', () => {
        const idleHeld = buildBaseClip('idle', true)
        const idleFree = buildBaseClip('idle', false)
        const poseHeld = sampleClip(idleHeld, 0.3)
        const poseFree = sampleClip(idleFree, 0.3)
        const qHeld = poseHeld.jointPoses.get('rightArmShoulder')!.rotation
        const qFree = poseFree.jointPoses.get('rightArmShoulder')!.rotation
        expect(qHeld.angleTo(qFree)).toBeGreaterThan(0.1)
    })

    it('非循环 clip 越界 clamp 到末帧（dying 保持倒地姿态）', () => {
        const clip = buildBaseClip('dying', false)
        const atEnd = sampleClip(clip, clip.duration)
        const beyond = sampleClip(clip, clip.duration + 1)
        const qEnd = atEnd.jointPoses.get('root')!.rotation
        const qBeyond = beyond.jointPoses.get('root')!.rotation
        expect(qEnd.angleTo(qBeyond)).toBeLessThan(1e-6)
    })

    it('关节 position 保持静止局部位置（头部等部位不被拉回原点）', () => {
        const clip = buildBaseClip('idle', false)
        const sampled = sampleClip(clip, 0.3)
        for (const jointId of CHARACTER_JOINT_IDS) {
            const rest = CHARACTER_JOINT_REST_POSITIONS[jointId]
            const pos = sampled.jointPoses.get(jointId)!.position
            expect(pos.x).toBeCloseTo(rest[0])
            expect(pos.y).toBeCloseTo(rest[1])
            expect(pos.z).toBeCloseTo(rest[2])
        }
        /* 头部静止位置在颈部上方，而非原点 */
        expect(sampled.jointPoses.get('headNeck')!.position.y).toBeCloseTo(0.36)
    })
})

describe('角色模型桥接（createCharacterSkeletonBridge）', () => {
    beforeAll(() => {
        stubCanvas2d()
    })

    it('绑定全部可动画关节 + rightHandPivot + leftHandPivot（Group 层级自动建连）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const bridge = createCharacterSkeletonBridge(model)
        /* CHARACTER_JOINT_IDS + rightHandPivot（武器挂点）+ leftHandPivot（双手 IK 链末端） */
        expect(bridge.joints.size).toBe(CHARACTER_JOINT_IDS.length + 2)
        expect(bridge.findJoint('rightHandPivot')).toBeDefined()
        expect(bridge.findJoint('leftHandPivot')).toBeDefined()
        /* Group 层级 → 骨架树一致：spine 的父是 root */
        expect(bridge.findJoint('spine')!.parent?.id).toBe('root')
        expect(bridge.findJoint('rightArmShoulder')!.parent?.id).toBe('spine')
        expect(bridge.findJoint('rightArmElbow')!.parent?.id).toBe('rightArmShoulder')
        expect(bridge.findJoint('rightHandPivot')!.parent?.id).toBe('rightArmElbow')
        expect(bridge.findJoint('rightWristPivot')!.parent?.id).toBe('rightHandPivot')
        expect(bridge.findJoint('leftHandPivot')!.parent?.id).toBe('leftArmElbow')
        expect(bridge.findJoint('rightLegHip')!.parent?.id).toBe('root')
        model.dispose()
    })

    it('applyPose 写骨架 → 桥接写回 Group（场景图级联）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const bridge = createCharacterSkeletonBridge(model)
        const pose = bridge.readPose()
        const shoulderPose = pose.jointPoses.get('rightArmShoulder')!
        shoulderPose.rotation.setFromEuler(new Euler(-0.9, 0, 0.4))
        bridge.applyPose(pose)
        expect(model.rightArmShoulder.rotation.x).toBeCloseTo(-0.9)
        expect(model.rightArmShoulder.rotation.z).toBeCloseTo(0.4)
        /* 场景图级联：手部 Group 随肩旋转 */
        model.group.updateMatrixWorld(true)
        const wristWorld = new Vector3()
        model.rightWristPivot.getWorldPosition(wristWorld)
        expect(wristWorld.x).not.toBeCloseTo(0)
        model.dispose()
    })

    it('syncFromScene：以场景为真源读回 Group 局部', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const bridge = createCharacterSkeletonBridge(model)
        model.headNeck.rotation.set(0.3, 0, 0)
        bridge.syncFromScene()
        const euler = new Euler().setFromQuaternion(bridge.findJoint('headNeck')!.rotation)
        expect(euler.x).toBeCloseTo(0.3)
        model.dispose()
    })
})