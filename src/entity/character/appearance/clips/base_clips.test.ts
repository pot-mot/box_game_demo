import {describe, it, expect, beforeAll, vi} from 'vitest'
import {Euler, Quaternion, Vector3} from 'three'
import {buildBaseClip, getBaseClipForHoldMode, getBaseLayers, CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS} from './base_clips.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, type PoseState} from '../pose_fns.ts'
import {WEAPON_GRIP_FLEX} from '../constants.ts'
import {GET_UP_PLANT_END, GET_UP_PUSH_END} from '../../../../character/combat/constants.ts'
import {sampleClip} from '../../../../skeleton/anim/sampling.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {composePoses} from '../../../../skeleton/anim/composition.ts'
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
        rightHandPivot: state.rightHandPivot,
        rightWristPivot: state.rightWristPivot,
        rightWeaponMount: state.rightWeaponMount,
        leftArmShoulder: state.leftArmShoulder,
        leftArmElbow: state.leftArmElbow,
        leftHandPivot: state.leftHandPivot,
        leftWristPivot: state.leftWristPivot,
        leftWeaponMount: state.leftWeaponMount,
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
        for (const state of ['walking', 'falling'] as const) {
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

    it('持械瞬态（跳跃 / 下落 / 死亡 / 受击 / 交互 / 破防）武器骨骼 = 握持屈角，与待机一致', () => {
        /* 修复回归：这些状态曾把武器骨骼写死为 0，导致武器贴合前臂穿模 */
        for (const state of ['jumping', 'falling', 'dying', 'flinching', 'interacting', 'guard_broken'] as const) {
            const held = BASE_POSE_SAMPLERS[state](0.2, {weaponHeld: true, horizontalSpeed: 0})
            const free = BASE_POSE_SAMPLERS[state](0.2, {weaponHeld: false, horizontalSpeed: 0})
            expect(held.rightWeaponMount.rx, `${state}:right`).toBeCloseTo(WEAPON_GRIP_FLEX)
            expect(held.leftWeaponMount.rx, `${state}:left`).toBeCloseTo(WEAPON_GRIP_FLEX)
            expect(free.rightWeaponMount.rx, `${state}:free`).toBeCloseTo(0)
        }
    })

    it('持盾臂基础姿态校正：盾面法线水平朝前（净 X 转角 = π/2）', () => {
        /* 盾面法线 = 武器本地 +Y；肩 + 肘 + 武器骨骼（均绕 X）合成后应指向角色前方 +Z */
        const shieldNormal = (clip: BoneAnimationClip, arm: 'right' | 'left', t: number): Vector3 => {
            const pose = sampleClip(clip, t)
            const shoulder = pose.jointPoses.get(`${arm}ArmShoulder`)!.rotation
            const elbow = pose.jointPoses.get(`${arm}ArmElbow`)!.rotation
            const mount = pose.jointPoses.get(`${arm}WeaponMount`)!.rotation
            const net = new Quaternion().multiplyQuaternions(shoulder, elbow).multiply(mount)
            return new Vector3(0, 1, 0).applyQuaternion(net)
        }
        for (const [state, arm] of [
            ['idle', 'right'], ['idle', 'left'], ['blocking', 'right'], ['blocking', 'left'],
        ] as const) {
            const clip = getBaseClipForHoldMode(state, true, 'one_handed', 0, [arm])
            const normal = shieldNormal(clip, arm, 0)
            expect(Math.abs(normal.y), `${state}:${arm}`).toBeLessThan(0.05)
            expect(normal.z, `${state}:${arm}`).toBeGreaterThan(0.99)
        }
    })

    it('起身姿态：双手先收到肩下撑地，再蹬肘收腿推起，末帧回站立中立位', () => {
        const meta = BASE_CLIP_META.getting_up
        const sample = (ratio: number): PoseState =>
            BASE_POSE_SAMPLERS.getting_up(meta.duration * ratio, {weaponHeld: false, horizontalSpeed: 0})
        const downed = sample(0)
        const braced = sample(GET_UP_PLANT_END)
        const pushed = sample(GET_UP_PUSH_END)
        const stand = sample(1)
        /* 撑地：肘继续前屈（自然弯折方向），双手收到肩侧撑住地面 */
        expect(Math.abs(braced.rightArmElbow.rx)).toBeGreaterThan(Math.abs(downed.rightArmElbow.rx))
        /* 推起：肘部蹬直、膝盖收到身下 */
        expect(Math.abs(pushed.rightArmElbow.rx)).toBeLessThan(Math.abs(braced.rightArmElbow.rx))
        expect(pushed.rightLegHip.rx).toBeLessThan(braced.rightLegHip.rx)
        expect(pushed.rightLegKnee.rx).toBeGreaterThan(braced.rightLegKnee.rx)
        /* 站直：全部回中立位 */
        expect(stand.rightArmShoulder.rx).toBeCloseTo(0)
        expect(stand.rightArmElbow.rx).toBeCloseTo(0)
        expect(stand.rightLegHip.rx).toBeCloseTo(0)
        expect(stand.rightLegKnee.rx).toBeCloseTo(0)
        /* 全过程肘不得反向超伸、膝不得反向弯折 */
        for (const ratio of [0, GET_UP_PLANT_END, 0.5, GET_UP_PUSH_END, 1]) {
            const pose = sample(ratio)
            expect(pose.rightArmElbow.rx, `肘@${ratio}`).toBeLessThanOrEqual(0)
            expect(pose.leftArmElbow.rx, `肘@${ratio}`).toBeLessThanOrEqual(0)
            expect(pose.rightLegKnee.rx, `膝@${ratio}`).toBeGreaterThanOrEqual(0)
            expect(pose.leftLegKnee.rx, `膝@${ratio}`).toBeGreaterThanOrEqual(0)
        }
    })

    it('倒地末帧与起身首帧姿态无缝一致（完全伏地 → 直接爬起）', () => {
        const knockdownEnd = BASE_POSE_SAMPLERS.knockdown(BASE_CLIP_META.knockdown.duration, {
            weaponHeld: false,
            horizontalSpeed: 0,
        })
        const gettingUpStart = BASE_POSE_SAMPLERS.getting_up(0, {weaponHeld: false, horizontalSpeed: 0})
        for (const jointId of CHARACTER_JOINT_IDS) {
            expect(quatOf(gettingUpStart, jointId).angleTo(quatOf(knockdownEnd, jointId)), jointId).toBeLessThan(1e-6)
        }
    })

    it('非循环 clip 越界 clamp 到末帧（dying 末帧保持直立）', () => {
        const clip = buildBaseClip('dying', false)
        const atEnd = sampleClip(clip, clip.duration)
        const beyond = sampleClip(clip, clip.duration + 1)
        const qEnd = atEnd.jointPoses.get('root')!.rotation
        const qBeyond = beyond.jointPoses.get('root')!.rotation
        expect(qEnd.angleTo(qBeyond)).toBeLessThan(1e-6)
        /* 死亡动画保持直立：倒地方向由 dying state 依据最后受击方向决定（world.ts 合成根旋转） */
        expect(qEnd.angleTo(new Quaternion())).toBeLessThan(1e-6)
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
    })
})

describe('角色模型桥接（createCharacterSkeletonBridge）', () => {
    beforeAll(() => {
        stubCanvas2d()
    })

    it('绑定全部可动画关节（含 rightHandPivot + leftHandPivot 手部骨骼，Group 层级自动建连）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const bridge = createCharacterSkeletonBridge(model)
        /* 桥接绑定模型的全部关节（jointGroups）；可动画关节集 CHARACTER_JOINT_IDS 是其中子集 */
        expect(bridge.joints.size).toBe(model.jointGroups.size)
        for (const jointId of CHARACTER_JOINT_IDS) {
            expect(bridge.findJoint(jointId), jointId).toBeDefined()
        }
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
        /* 场景图级联：手部 Group 随肩旋转（比较相对肩的偏移，不依赖肩的绝对左右坐标） */
        model.group.updateMatrixWorld(true)
        const wristWorld = new Vector3()
        const shoulderWorld = new Vector3()
        model.rightWristPivot.getWorldPosition(wristWorld)
        model.rightArmShoulder.getWorldPosition(shoulderWorld)
        const wristOffset = wristWorld.sub(shoulderWorld)
        expect(wristOffset.x).not.toBeCloseTo(0)
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

    it('装备武器后武器挂点默认旋转 = 握持屈角（未播放动画的静止默认姿态不穿模），卸下复位', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        /* 空手默认：挂点无握持角 */
        expect(model.rightWeaponMount.rotation.x).toBeCloseTo(0)
        model.equipWeapon({main: {id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322}})
        /* 装备后（装备预览等静止姿态）：武器骨骼即为握持屈角，与待机 / 行走一致 */
        expect(model.rightWeaponMount.rotation.x).toBeCloseTo(WEAPON_GRIP_FLEX)
        model.removeWeapon()
        expect(model.rightWeaponMount.rotation.x).toBeCloseTo(0)
        model.dispose()
    })

    it('双武器装配：主手 / 副手各挂到对应武器挂点，removeWeapon 一并卸载', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        model.equipWeapon({
            main: {id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322},
            offhand: {id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322},
        })
        expect(model.weaponGroup).not.toBeNull()
        expect(model.offhandWeaponGroup).not.toBeNull()
        expect(model.rightWeaponMount.children).toHaveLength(1)
        expect(model.leftWeaponMount.children).toHaveLength(1)
        model.removeWeapon()
        expect(model.weaponGroup).toBeNull()
        expect(model.offhandWeaponGroup).toBeNull()
        expect(model.rightWeaponMount.children).toHaveLength(0)
        expect(model.leftWeaponMount.children).toHaveLength(0)
        model.dispose()
    })

    it('盾挂背：setOffhandStowed 附加绕本地 X 的竖直校正，法线保持水平', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        model.equipWeapon({
            main: {id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322},
            offhand: {id: 'shield_small', width: 0.44, height: 0.44, thickness: 0.06, round: true, color: 0x8a6a3a, gripColor: 0x4a3520, bossColor: 0x9a9a9a},
        })
        const group = model.offhandWeaponGroup!
        model.setOffhandStowed(true)
        expect(group.rotation.x).toBeCloseTo(-Math.PI / 2)
        /* 挂背在 backWeaponMount（绕 Z 旋转）下：盾面法线（本地 +Y）仍保持水平 */
        model.group.updateMatrixWorld(true)
        const normal = new Vector3(0, 1, 0).applyQuaternion(group.getWorldQuaternion(new Quaternion()))
        expect(Math.abs(normal.y)).toBeLessThan(1e-6)
        model.setOffhandStowed(false)
        expect(group.rotation.x).toBeCloseTo(0)
        model.dispose()
    })

    it('副手挂背 / 回手：setOffhandStowed 只换父节点，不重建几何（双手共持用）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        model.equipWeapon({
            main: {id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322},
            offhand: {id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422},
        })
        const offhandGroup = model.offhandWeaponGroup
        expect(offhandGroup).not.toBeNull()
        expect(model.leftWeaponMount.children).toHaveLength(1)

        model.setOffhandStowed(true)
        /* 同一个 Group 换父节点：命中箱/刀尖引用不变 */
        expect(model.offhandWeaponGroup).toBe(offhandGroup)
        expect(model.leftWeaponMount.children).toHaveLength(0)
        expect(model.backWeaponMount.children).toHaveLength(1)

        model.setOffhandStowed(false)
        expect(model.leftWeaponMount.children).toHaveLength(1)
        expect(model.backWeaponMount.children).toHaveLength(0)

        model.removeWeapon()
        expect(model.backWeaponMount.children).toHaveLength(0)
        expect(model.leftWeaponMount.children).toHaveLength(0)
        model.dispose()
    })

    it('持握模式合并 clip 与分层组合等价（均匀权重、下半身/上半身关节不重叠）', () => {
        for (const [state, holdMode] of [['idle', 'one_handed'], ['walking', 'two_handed'], ['walking', 'dual_wield']] as const) {
            const merged = getBaseClipForHoldMode(state, true, holdMode, 0)
            /* 全身 15 关节都写在合并 clip 里 */
            expect(merged.jointTracks.map(track => track.targetId).sort()).toEqual([...CHARACTER_JOINT_IDS].sort())
            for (const ratio of [0, 0.3, 0.7]) {
                const composed = composePoses(
                    getBaseLayers(state, true, holdMode, 0).map(layer => ({...layer, progress: ratio})),
                )
                const sampled = sampleClip(merged, merged.duration * ratio)
                for (const [jointId, pose] of composed.jointPoses) {
                    const direct = sampled.jointPoses.get(jointId)!
                    expect(direct.rotation.angleTo(pose.rotation), jointId).toBeLessThan(1e-6)
                }
            }
        }
    })
})