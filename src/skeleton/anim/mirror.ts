import {Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord, BoneSegmentKeyframeRecord} from './types.ts'

/**
 * 骨骼动画镜像原语：把一段动作跨角色局部 X=0 平面（矢状面）反射到另一侧。
 *
 * 约定（本项目坐标系）：角色面朝 +Z、+Y 向上，故解剖学右侧 = -X、左侧 = +X。
 * 左右关节的静止局部坐标系同为 identity（仅差父级 X 平移），
 * 因此反射等价于「左右关节 id 互换 + 局部旋转共轭 + 局部位置 x 取反」：
 * - 旋转：跨 X=0 平面的反射共轭 → 欧拉 `(rx, ry, rz) → (rx, -ry, -rz)`、四元数 `(x, y, z, w) → (x, -y, -z, w)`；
 * - 位置：`(px, py, pz) → (-px, py, pz)`（关节静止位置已按侧内建，仅动画内嵌偏移需取反）。
 *
 * 该变换对 Three.js 任意欧拉顺序成立（共轭 `S·R·S` 是同态）。
 */

/** 左右词缀互换（`right*` ↔ `left*`），其余 id（root/spine/headNeck/backWeaponMount…）原样返回。 */
export const mirrorJointId = (id: string): string => {
    if (id.startsWith('right')) return `left${id.slice(5)}`
    if (id.startsWith('left')) return `right${id.slice(4)}`
    return id
}

/** 跨 X=0 平面的反射共轭：四元数 `(x, y, z, w) → (x, -y, -z, w)`。 */
export const conjugateQuaternion = (q: Quaternion): Quaternion =>
    new Quaternion(q.x, -q.y, -q.z, q.w)

/** 位置跨 X=0 平面反射：`(px, py, pz) → (-px, py, pz)`。 */
export const reflectPosition = (p: Vector3): Vector3 =>
    new Vector3(-p.x, p.y, p.z)

/** 单个关节关键帧记录的反射共轭（位置 x 取反 + 旋转共轭），左右 id 由调用方决定是否互换。 */
export const conjugateJointRecord = (record: BoneJointKeyframeRecord): BoneJointKeyframeRecord => ({
    time: record.time,
    position: reflectPosition(record.position),
    rotation: conjugateQuaternion(record.rotation),
})

/** 骨骼段记录的反射共轭：扭转角 `roll` 取反（反射反转扭转手性）。 */
export const conjugateSegmentRecord = (record: BoneSegmentKeyframeRecord): BoneSegmentKeyframeRecord => ({
    time: record.time,
    roll: -record.roll,
})

/**
 * clip 镜像：关节轨 / 骨骼段轨左右互换 + 每帧反射共轭；
 * 插值规格与事件轨（命名事件，与侧别无关）保持原样。
 */
export const mirrorClip = (clip: BoneAnimationClip): BoneAnimationClip => ({
    ...clip,
    jointTracks: clip.jointTracks.map(track => ({
        ...track,
        targetId: mirrorJointId(track.targetId),
        records: track.records.map(conjugateJointRecord),
    })),
    boneTracks: clip.boneTracks.map(track => ({
        ...track,
        targetId: mirrorJointId(track.targetId),
        records: track.records.map(conjugateSegmentRecord),
    })),
})
