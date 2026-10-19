import {Quaternion, type Object3D} from 'three'
import type {RigidBody} from '@dimforge/rapier3d-compat'

/**
 * 渲染插值（滞后一拍）：
 * 每个物理步末 `capture*` 记录真实变换（prev / curr），渲染帧用 `applyRenderPose(alpha)`
 * 在两个物理状态之间插值，避免固定步与渲染帧频率不同步导致的台阶式抖动。
 *
 * - 传送 / 瞬移（单步位移超过 `SNAP_DISTANCE`）直接吸附，不产生插值滑行；
 * - 历史用 `WeakMap` 挂在渲染对象上，逐帧零分配。
 */

interface Pose {
    x: number
    y: number
    z: number
    qx: number
    qy: number
    qz: number
    qw: number
}

interface PoseHistory {
    readonly prev: Pose
    readonly curr: Pose
    hasPrev: boolean
    hasCurr: boolean
}

/** 单物理步位移超过该值视为传送（60 步/秒下约 60 m/s），不做插值滑行 */
const SNAP_DISTANCE = 1.0

const histories = new WeakMap<Object3D, PoseHistory>()
const _qPrev = new Quaternion()
const _qCurr = new Quaternion()

const createPose = (): Pose => ({x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1})

const getHistory = (object: Object3D): PoseHistory => {
    let history = histories.get(object)
    if (history === undefined) {
        history = {prev: createPose(), curr: createPose(), hasPrev: false, hasCurr: false}
        histories.set(object, history)
    }
    return history
}

const writePose = (pose: Pose, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void => {
    pose.x = x
    pose.y = y
    pose.z = z
    pose.qx = qx
    pose.qy = qy
    pose.qz = qz
    pose.qw = qw
}

const copyPose = (from: Pose, to: Pose): void => {
    writePose(to, from.x, from.y, from.z, from.qx, from.qy, from.qz, from.qw)
}

const submitPose = (object: Object3D, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void => {
    const history = getHistory(object)
    if (history.hasCurr) {
        const dx = x - history.curr.x
        const dy = y - history.curr.y
        const dz = z - history.curr.z
        if (dx * dx + dy * dy + dz * dz > SNAP_DISTANCE * SNAP_DISTANCE) {
            /* 传送 / 瞬移：直接吸附，避免从旧位置插值滑行 */
            writePose(history.prev, x, y, z, qx, qy, qz, qw)
            writePose(history.curr, x, y, z, qx, qy, qz, qw)
            history.hasPrev = true
            history.hasCurr = true
            return
        }
        copyPose(history.curr, history.prev)
        history.hasPrev = true
    } else {
        writePose(history.prev, x, y, z, qx, qy, qz, qw)
        history.hasPrev = true
    }
    writePose(history.curr, x, y, z, qx, qy, qz, qw)
    history.hasCurr = true
}

/** 物理步末：按刚体真实变换记录 */
export const captureBodyRenderPose = (object: Object3D, body: RigidBody): void => {
    const p = body.translation()
    const r = body.rotation()
    submitPose(object, p.x, p.y, p.z, r.x, r.y, r.z, r.w)
}

/** 物理步末：按渲染对象当前变换记录（用于角色这类带姿态偏移的可视节点） */
export const captureObjectRenderPose = (object: Object3D): void => {
    const p = object.position
    const q = object.quaternion
    submitPose(object, p.x, p.y, p.z, q.x, q.y, q.z, q.w)
}

/** 传送 / 重建后重置历史：prev = curr = 当前变换，避免插值滑行 */
export const resetObjectRenderPose = (object: Object3D): void => {
    const history = getHistory(object)
    const p = object.position
    const q = object.quaternion
    writePose(history.prev, p.x, p.y, p.z, q.x, q.y, q.z, q.w)
    writePose(history.curr, p.x, p.y, p.z, q.x, q.y, q.z, q.w)
    history.hasPrev = true
    history.hasCurr = true
}

/**
 * 渲染帧：按 `alpha` 在两个物理状态间插值并写回对象。
 * @returns 无历史时返回 false（调用方回退到直接读物理状态）
 */
export const applyRenderPose = (object: Object3D, alpha: number): boolean => {
    const history = histories.get(object)
    if (history === undefined || !history.hasCurr) return false
    const t = history.hasPrev ? Math.min(Math.max(alpha, 0), 1) : 1
    const prev = history.prev
    const curr = history.curr
    object.position.set(
        prev.x + (curr.x - prev.x) * t,
        prev.y + (curr.y - prev.y) * t,
        prev.z + (curr.z - prev.z) * t,
    )
    _qPrev.set(prev.qx, prev.qy, prev.qz, prev.qw)
    _qCurr.set(curr.qx, curr.qy, curr.qz, curr.qw)
    object.quaternion.copy(_qPrev.slerp(_qCurr, t))
    return true
}
