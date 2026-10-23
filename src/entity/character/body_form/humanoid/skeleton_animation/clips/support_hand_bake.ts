import {Vector3, type Group} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord} from '../../../../../../skeleton/anim/types.ts'
import type {Skeleton} from '../../../../../../skeleton/skeleton.ts'
import {rotateJointSubtree} from '../../../../../../skeleton/skeleton.ts'
import {skeletonFromDefinition} from '../../../../../../skeleton/anim/serialization.ts'
import {sampleClip} from '../../../../../../skeleton/anim/sampling.ts'
import {collectChainBetween, solveCcd} from '../../../../../../skeleton/ik.ts'
import {DEFAULT_BAKE_FPS} from '../../../../../../skeleton/anim/bake.ts'
import {DEFAULT_IK_MAX_ITERATIONS} from '../../../../../../skeleton/constants.ts'
import type {SkeletonJoint} from '../../../../../../skeleton/joint.ts'
import {buildCharacterSkeletonDefinition} from '../../skeleton/skeleton.ts'
import {HUMANOID_WEAPONS} from '../../equipment/weapons.ts'
import {defaultHoldMode, type WeaponConfig} from '../../../../../../character/weapon/catalog.ts'
import {ATTACK_CLIPS} from '../attack_clips/index.ts'
import {createWeaponMesh, WEAPON_MESH_GRIPS} from '../../../../appearance/weapon_mesh.ts'
import type {SupportHandTrackData} from './support_hand_merge.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS} from '../pose_fns.ts'
import {CLIP_SAMPLE_FPS} from '../../state/constants.ts'

/**
 * 双手共持攻击的副手关键帧烘焙（**离屏一次性烘焙**，不是运行时离线烘焙）：
 * - 仅处理人形双手段（`_two_handed_` 或默认双手的远程武器）；
 * - 在每个采样帧把支撑手臂链 CCD 求解到主武器副握点，并把左肩 / 左肘的局部旋转写成线性关键帧；
 * - 结果在 `attack_clips.ts` 首帧解析时缓存，播放时仍只做普通 clip 采样。
 */

const SUPPORT_SHOULDER_ID = 'leftArmShoulder'
const SUPPORT_ELBOW_ID = 'leftArmElbow'
const SUPPORT_END_CANDIDATES = ['leftWeaponMount', 'leftWristPivot', 'leftHandPivot'] as const
const MAIN_MOUNT_ID = 'rightWeaponMount'

/** 烘焙采样精度与 CCD 参数（算法变更时递增版本，使指纹失效） */
const SUPPORT_HAND_BAKE_VERSION = 1
const SUPPORT_BAKE_MAX_ITERATIONS = Math.max(DEFAULT_IK_MAX_ITERATIONS, 16)
const SUPPORT_BAKE_TOLERANCE = 0.002

/** 武器副握点在武器挂点局部的坐标（含武器固有握持旋转 / 位置偏移） */
const supportGripLocalCache = new Map<string, Vector3>()

/** 全部支持双手共持的人形武器（按 classId 唯一） */
export const TWO_HANDED_WEAPONS: readonly WeaponConfig[] =
    HUMANOID_WEAPONS.filter(weapon => weapon.holdModes.includes('two_handed'))

export const weaponOfClip = (clipId: string): WeaponConfig | undefined =>
    TWO_HANDED_WEAPONS.find(weapon =>
        clipId === weapon.classId || clipId.startsWith(`${weapon.classId}_`))

/** 是否为需要副手烘焙的双手攻击段 */
export const isTwoHandedAttackClip = (clipId: string): boolean => {
    const weapon = weaponOfClip(clipId)
    if (weapon === undefined) return false
    if (clipId.includes('_two_handed_')) return true
    return weapon.type === 'ranged' && defaultHoldMode(weapon) === 'two_handed'
}

/**
 * 武器副握点在挂点局部的坐标：与 `createWeaponMesh` 的 Group 变换一致。
 * 结果按武器 id 缓存；仅首次构建一次网格用于读取握持变换，随后立即释放。
 */
export const supportGripLocalOf = (weapon: WeaponConfig): Vector3 | undefined => {
    const cached = supportGripLocalCache.get(weapon.classId)
    if (cached !== undefined) return cached.clone()
    const result = createWeaponMesh(weapon.mesh)
    const local = new Vector3(0, result.supportGripOffset, 0)
        .applyQuaternion(result.group.quaternion)
        .add(result.group.position)
    result.cleanup()
    supportGripLocalCache.set(weapon.classId, local)
    return local.clone()
}

/** 绕「肩→末端」轴把肘摆到 poleWorld 方向（消除 CCD 收敛出的反关节） */
const applyElbowPole = (
    skeleton: Skeleton,
    shoulder: SkeletonJoint,
    elbow: SkeletonJoint,
    end: SkeletonJoint,
    poleWorld: Vector3,
): void => {
    const shoulderWorld = skeleton.getWorldPosition(shoulder.id)
    const endWorld = skeleton.getWorldPosition(end.id)
    const elbowWorld = skeleton.getWorldPosition(elbow.id)
    if (shoulderWorld === undefined || endWorld === undefined || elbowWorld === undefined) return
    const axis = endWorld.clone().sub(shoulderWorld)
    if (axis.lengthSq() < 1e-10) return
    axis.normalize()
    const elbowPerp = elbowWorld.clone().sub(shoulderWorld)
    elbowPerp.addScaledVector(axis, -elbowPerp.dot(axis))
    const polePerp = poleWorld.clone()
    polePerp.addScaledVector(axis, -polePerp.dot(axis))
    if (elbowPerp.lengthSq() < 1e-10 || polePerp.lengthSq() < 1e-10) return
    elbowPerp.normalize()
    polePerp.normalize()
    const cos = Math.min(1, Math.max(-1, elbowPerp.dot(polePerp)))
    const sin = axis.dot(elbowPerp.clone().cross(polePerp))
    const angle = Math.atan2(sin, cos)
    if (Math.abs(angle) < 1e-6) return
    rotateJointSubtree(skeleton, shoulder, shoulderWorld, axis, angle)
}

/** 目标超出臂展时按可达距离截断 */
const clampToReach = (skeleton: Skeleton, chain: readonly SkeletonJoint[], target: Vector3): void => {
    const rootWorld = skeleton.getWorldPosition(chain[0].id)
    if (rootWorld === undefined) return
    let reach = 0
    for (let i = 1; i < chain.length; i++) {
        const from = skeleton.getWorldPosition(chain[i - 1].id)
        const to = skeleton.getWorldPosition(chain[i].id)
        if (from !== undefined && to !== undefined) reach += from.distanceTo(to)
    }
    const offset = target.clone().sub(rootWorld)
    if (reach > 0 && offset.length() > reach) {
        target.copy(rootWorld).add(offset.setLength(reach))
    }
}

/** 计算当前帧副握点世界坐标 */
const supportGripTarget = (
    skeleton: Skeleton,
    gripLocal: Vector3,
    out: Vector3,
): boolean => {
    const mountPos = skeleton.getWorldPosition(MAIN_MOUNT_ID)
    const mountRot = skeleton.getWorldRotation(MAIN_MOUNT_ID)
    if (mountPos === undefined || mountRot === undefined) return false
    out.copy(gripLocal).applyQuaternion(mountRot).add(mountPos)
    return true
}

const makeTrack = (
    targetId: string,
    records: readonly BoneJointKeyframeRecord[],
): {targetId: string; interpolation: {type: 'linear'}; records: readonly BoneJointKeyframeRecord[]} => ({
    targetId,
    interpolation: {type: 'linear'},
    records,
})

const replaceTrack = (
    tracks: BoneAnimationClip['jointTracks'],
    targetId: string,
    records: readonly BoneJointKeyframeRecord[],
): BoneAnimationClip['jointTracks'] => {
    const track = makeTrack(targetId, records)
    return tracks.some(candidate => candidate.targetId === targetId)
        ? tracks.map(candidate => candidate.targetId === targetId ? track : candidate)
        : [...tracks, track]
}

/**
 * 把双手 clip 的支撑手轨迹烘焙为显式关键帧：
 * 在原有动作时间轴上按 30fps 采样，逐帧求解 `leftArmShoulder → leftArmElbow → 腕/武器挂点`
 * 到主武器副握点，并写入左肩 / 左肘 track（线性插值）。
 */
export const bakeSupportHandToGrip = (
    clip: BoneAnimationClip,
    gripLocal: Vector3,
    includeOriginalTimes = true,
): BoneAnimationClip => {
    const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
    const restPose = skeleton.readPose()
    const root = skeleton.getRoots()[0]
    const rootRestPosition = root?.position.clone()
    const shoulder = skeleton.findJoint(SUPPORT_SHOULDER_ID)
    const elbow = skeleton.findJoint(SUPPORT_ELBOW_ID)
    if (shoulder === undefined || elbow === undefined) return clip
    const end = SUPPORT_END_CANDIDATES
        .map(id => skeleton.findJoint(id))
        .find((joint): joint is SkeletonJoint => joint !== undefined)
    if (end === undefined) return clip
    const chain = collectChainBetween(shoulder, end)
    if (chain.length <= 1) return clip

    const frames = Math.max(2, Math.round(clip.duration * DEFAULT_BAKE_FPS) + 1)
    /* 采样时间 = 30fps 均匀帧 ∪ 原副手肩肘关键帧时刻（保留姿势修订引用的精确时间点） */
    const sampleTimes = new Set<number>()
    for (let i = 0; i < frames; i++) {
        sampleTimes.add(Number((clip.duration * i / (frames - 1)).toFixed(6)))
    }
    if (includeOriginalTimes) {
        for (const jointId of [SUPPORT_SHOULDER_ID, SUPPORT_ELBOW_ID]) {
            const track = clip.jointTracks.find(candidate => candidate.targetId === jointId)
            for (const record of track?.records ?? []) sampleTimes.add(record.time)
        }
    }
    const sortedTimes = [...sampleTimes].sort((a, b) => a - b)

    const shoulderRecords: BoneJointKeyframeRecord[] = []
    const elbowRecords: BoneJointKeyframeRecord[] = []
    const target = new Vector3()
    const mainShoulderId = 'rightArmShoulder'

    for (const t of sortedTimes) {
        skeleton.applyPose(restPose)
        skeleton.applyPose(sampleClip(clip, t))
        /* 生产角色根位移由物理 body 管理；烘焙时固定根局部位置，保持与运行时一致 */
        if (root !== undefined && rootRestPosition !== undefined) {
            root.position.copy(rootRestPosition)
            skeleton.updateWorldTransforms()
        }
        if (!supportGripTarget(skeleton, gripLocal, target)) continue
        clampToReach(skeleton, chain, target)
        solveCcd(skeleton, chain, target, {
            maxIterations: SUPPORT_BAKE_MAX_ITERATIONS,
            tolerance: SUPPORT_BAKE_TOLERANCE,
        })

        const supportShoulder = skeleton.getWorldPosition(SUPPORT_SHOULDER_ID)
        const mainShoulder = skeleton.getWorldPosition(mainShoulderId)
        if (supportShoulder !== undefined && mainShoulder !== undefined) {
            const poleWorld = new Vector3(0, -1, 0)
            const outward = supportShoulder.clone().sub(mainShoulder)
            if (outward.lengthSq() > 1e-8) poleWorld.addScaledVector(outward.normalize(), 0.5).normalize()
            applyElbowPole(skeleton, shoulder, elbow, end, poleWorld)
            skeleton.updateWorldTransforms()
        }

        const time = Number(t.toFixed(6))
        shoulderRecords.push({
            time,
            position: shoulder.position.clone(),
            rotation: shoulder.rotation.clone(),
        })
        elbowRecords.push({
            time,
            position: elbow.position.clone(),
            rotation: elbow.rotation.clone(),
        })
    }

    if (shoulderRecords.length === 0) return clip
    let jointTracks = replaceTrack(clip.jointTracks, SUPPORT_SHOULDER_ID, shoulderRecords)
    jointTracks = replaceTrack(jointTracks, SUPPORT_ELBOW_ID, elbowRecords)
    return {...clip, jointTracks}
}

/** 从已挂载的武器 Group 计算副握点在武器挂点局部的坐标（基础状态烘焙用） */
export const supportGripLocalFromWeapon = (weaponGroup: Group, supportGripOffset: number): Vector3 =>
    new Vector3(0, supportGripOffset, 0)
        .applyQuaternion(weaponGroup.quaternion)
        .add(weaponGroup.position)

const fnv1a = (text: string): string => {
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 支撑手烘焙指纹：只用于判断生成数据是否过期，不冒充动作正确性测试。
 *
 * 必须覆盖所有会改变烘焙输入的项：完整基础姿态（含左臂/腿/头）、基础状态时长、
 * 攻击作者数据、武器网格/握点、采样率、IK 参数与算法版本。
 */
export const computeSupportHandFingerprint = (): string => {
    const parts: string[] = [
        'support-hand-bake', String(SUPPORT_HAND_BAKE_VERSION),
        String(DEFAULT_BAKE_FPS), String(CLIP_SAMPLE_FPS),
        String(SUPPORT_BAKE_MAX_ITERATIONS), String(SUPPORT_BAKE_TOLERANCE),
        String(DEFAULT_IK_MAX_ITERATIONS),
    ]
    for (const weapon of TWO_HANDED_WEAPONS) {
        const grip = WEAPON_MESH_GRIPS[weapon.mesh.id]
        parts.push(weapon.classId, JSON.stringify(weapon.mesh), JSON.stringify(grip))
        for (const state of Object.keys(BASE_POSE_SAMPLERS) as (keyof typeof BASE_POSE_SAMPLERS)[]) {
            const meta = BASE_CLIP_META[state]
            parts.push(state, String(meta.duration), String(meta.loop))
            for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
                const pose = BASE_POSE_SAMPLERS[state](meta.duration * ratio, {weaponHeld: true, horizontalSpeed: 0})
                parts.push(ratio.toFixed(2), JSON.stringify(pose))
            }
        }
    }
    for (const [clipId, authored] of Object.entries(ATTACK_CLIPS)) {
        if (isTwoHandedAttackClip(clipId)) parts.push(clipId, JSON.stringify(authored))
    }
    return fnv1a(parts.join('|'))
}

/** 从已烘焙 clip 提取支撑手双轨（生成器/验证测试用） */
export const extractSupportTracks = (clip: BoneAnimationClip): SupportHandTrackData | undefined => {
    const shoulder = clip.jointTracks.find(track => track.targetId === SUPPORT_SHOULDER_ID)
    const elbow = clip.jointTracks.find(track => track.targetId === SUPPORT_ELBOW_ID)
    if (shoulder === undefined || elbow === undefined) return undefined
    return {
        times: shoulder.records.map(record => record.time),
        shoulder: shoulder.records.map(record => [record.rotation.x, record.rotation.y, record.rotation.z, record.rotation.w] as const),
        elbow: elbow.records.map(record => [record.rotation.x, record.rotation.y, record.rotation.z, record.rotation.w] as const),
    }
}

/** 攻击 clip 入口：识别双手段并按其所属武器副握点烘焙 */
export const bakeTwoHandedSupportHand = (clipId: string, clip: BoneAnimationClip): BoneAnimationClip => {
    if (!isTwoHandedAttackClip(clipId)) return clip
    const weapon = weaponOfClip(clipId)
    if (weapon === undefined) return clip
    const gripLocal = supportGripLocalOf(weapon)
    if (gripLocal === undefined) return clip
    return bakeSupportHandToGrip(clip, gripLocal)
}
