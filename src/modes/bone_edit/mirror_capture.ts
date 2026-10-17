import type {Quaternion, Vector3} from 'three'
import {conjugateQuaternion, mirrorJointId, reflectPosition} from '../../skeleton/anim/mirror.ts'

/**
 * 惯用手预览下的关键帧采集映射。
 *
 * 左撇子预览时播放的是**镜像 clip**：canonical 轨道 `g` 的姿势实际落在镜像关节 `mirrorJointId(g)` 上
 * （左右关节静止局部坐标系同为 identity，故镜像等价于「id 互换 + 反射共轭」）。
 * 因此采集必须读取镜像关节、再把姿势反射回 canonical，否则会读到相邻关节并丢失拖拽结果。
 * 右撇子（非镜像）时读 / 写同一 id、姿势原样取值。
 */

/** 采集源关节 id：承载 canonical 轨道 `canonicalId` 姿势的关节（左撇子预览下为镜像关节） */
export const captureSourceId = (canonicalId: string, mirrored: boolean): string =>
    mirrored ? mirrorJointId(canonicalId) : canonicalId

/** 采集关节姿势：把关节上的显示姿势反射回 canonical（左撇子预览时位置 x 取反、旋转共轭） */
export const captureJointPose = (
    position: Vector3,
    rotation: Quaternion,
    mirrored: boolean,
): {position: Vector3; rotation: Quaternion} =>
    mirrored
        ? {position: reflectPosition(position), rotation: conjugateQuaternion(rotation)}
        : {position: position.clone(), rotation: rotation.clone()}

/** 采集骨骼段扭转角：反射反转扭转手性，左撇子预览时取反 */
export const captureBoneRoll = (roll: number, mirrored: boolean): number =>
    mirrored ? -roll : roll
