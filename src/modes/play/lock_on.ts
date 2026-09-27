import {Vector3, type Object3D} from 'three'
import type {AttackTendency, Faction} from '../../character/faction.ts'
import type {LockPointConfig} from '../../character/lock_point.ts'
import {LOCK_ON_HALF_ANGLE, LOCK_ON_RADIUS, LOCK_ON_RELEASE_RADIUS} from './constants.ts'

/** 锁定候选：角色 + 该角色的某个锁定点（水平坐标） */
export interface LockOnCandidate {
    readonly actorId: number
    /** 锁定点在角色锁定点序列中的下标（0 = 默认身体中心点） */
    readonly pointIndex: number
    readonly x: number
    readonly z: number
}

/** 锁定所需的目标角色最小接口（避免直接依赖 CharacterEntity 全量类型） */
export interface LockOnActor {
    readonly id: number
    /** 额外锁定点（默认身体中心点不在数组内，运行时恒存在且下标为 0） */
    readonly lockPoints: readonly LockPointConfig[]
    readonly combat: {
        readonly isDead: boolean
        readonly faction: Faction
        readonly attackTendency: AttackTendency
    }
    readonly body: {
        readonly translation: () => { readonly x: number; readonly y: number; readonly z: number }
    }
    /** 外观模型根节点：按关节 id（Group.name）解析额外锁定点的世界坐标 */
    readonly appearanceGroup: Object3D
}

/** 锁定所需的角色系统最小接口（便于测试注入） */
export interface LockOnCharacterSource {
    readonly getPlayerCharacter: () => LockOnActor | undefined
    readonly getAll: () => readonly LockOnActor[]
}

/** 锁定所需的相机最小接口（取水平朝向角） */
export interface LockOnCamera {
    readonly getWorldDirection: (target: Vector3) => Vector3
}

/** 归一化角度到 (-π, π] */
export const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle))

/**
 * 从候选锁定点中挑选锁定对象：与玩家的水平距离 ≤ `LOCK_ON_RADIUS`、
 * 相对镜头水平朝向的偏角 ≤ `LOCK_ON_HALF_ANGLE`；取偏角最小者（偏角相同取更近者）。
 */
export const selectLockOnTarget = (
    playerX: number,
    playerZ: number,
    viewYaw: number,
    candidates: readonly LockOnCandidate[],
): LockOnCandidate | undefined => {
    let best: LockOnCandidate | undefined
    let bestAngle = Number.POSITIVE_INFINITY
    let bestDist = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
        const dx = candidate.x - playerX
        const dz = candidate.z - playerZ
        const dist = Math.hypot(dx, dz)
        if (dist > LOCK_ON_RADIUS) continue
        /* 与玩家重合的目标视为正前方，规避 atan2(0, 0) 的未定义方向 */
        const angle = dist > 0.001 ? Math.abs(wrapAngle(Math.atan2(dx, dz) - viewYaw)) : 0
        if (angle > LOCK_ON_HALF_ANGLE) continue
        if (angle < bestAngle || (angle === bestAngle && dist < bestDist)) {
            best = candidate
            bestAngle = angle
            bestDist = dist
        }
    }
    return best
}

/**
 * 解析角色全部锁定点的世界坐标并写入 out（下标 0 = 默认身体中心点，之后按配置顺序）。
 * 找不到对应关节的点跳过；复用 out 中的向量避免每帧分配；返回有效点数。
 */
const resolveLockPointPositions = (actor: LockOnActor, out: Vector3[]): number => {
    let count = 0
    const acquire = (): Vector3 => {
        const existing = out[count]
        if (existing !== undefined) {
            count++
            return existing
        }
        const created = new Vector3()
        out[count] = created
        count++
        return created
    }
    const center = actor.body.translation()
    acquire().set(center.x, center.y, center.z)
    for (const point of actor.lockPoints) {
        const joint = actor.appearanceGroup.getObjectByName(point.jointId)
        if (joint === undefined) continue
        /* 关节 matrixWorld 可能滞后于本帧动画写入，先刷新祖先与自身 */
        joint.updateWorldMatrix(true, false)
        const target = acquire().set(point.offset[0], point.offset[1], point.offset[2])
        joint.localToWorld(target)
    }
    return count
}

/** 游玩模式玩家锁定控制器 */
export interface PlayerLockOn {
    /** 切换锁定：已锁定 → 解除；未锁定 → 在镜头前方搜索并锁定（无目标时保持未锁定） */
    readonly toggle: () => void
    /** 解除锁定（未锁定时为空操作） */
    readonly release: () => void
    /** 当前锁定目标的瞄准点（即命中的锁定点，复用向量，勿长期持有）；未锁定或目标失效时返回 undefined */
    readonly getAimPoint: () => Vector3 | undefined
}

/**
 * 创建玩家锁定控制器：只持有「当前锁定目标 id + 锁定点下标」，逐帧校验目标存活与距离并输出瞄准点。
 * 候选 = 玩家可攻击角色的全部锁定点（默认身体中心 + 关节额外点），镜头侧不感知阵营与结算细节。
 */
export const createPlayerLockOn = (
    characterSystem: LockOnCharacterSource,
    camera: LockOnCamera,
): PlayerLockOn => {
    let targetId: number | undefined
    let targetPointIndex = 0
    const aimPoint = new Vector3()
    const viewDirection = new Vector3()
    /* 复用的候选缓冲与锁定点坐标池，避免切换锁定 / 逐帧解析时反复分配 */
    const candidates: LockOnCandidate[] = []
    const pointPool: Vector3[] = []

    const release = (): void => {
        targetId = undefined
    }

    const toggle = (): void => {
        if (targetId !== undefined) {
            release()
            return
        }
        const player = characterSystem.getPlayerCharacter()
        if (!player) return
        const playerPos = player.body.translation()
        camera.getWorldDirection(viewDirection)
        const viewYaw = Math.atan2(viewDirection.x, viewDirection.z)
        candidates.length = 0
        for (const other of characterSystem.getAll()) {
            if (other.id === player.id || other.combat.isDead) continue
            if (!player.combat.attackTendency(player.combat.faction, other.combat.faction)) continue
            const pointCount = resolveLockPointPositions(other, pointPool)
            for (let index = 0; index < pointCount; index++) {
                const point = pointPool[index]
                candidates.push({actorId: other.id, pointIndex: index, x: point.x, z: point.z})
            }
        }
        const best = selectLockOnTarget(playerPos.x, playerPos.z, viewYaw, candidates)
        if (best) {
            targetId = best.actorId
            targetPointIndex = best.pointIndex
        }
    }

    /** 解析当前锁定目标并逐帧校验（存活 / 玩家存在 / 脱锁半径）；失效则解除并返回 undefined */
    const resolveTarget = (): LockOnActor | undefined => {
        if (targetId === undefined) return undefined
        const player = characterSystem.getPlayerCharacter()
        if (!player) {
            release()
            return undefined
        }
        const target = characterSystem.getAll().find(c => c.id === targetId)
        if (!target || target.combat.isDead) {
            release()
            return undefined
        }
        /* 目标脱离脱锁半径（迟滞）后放弃追踪，避免远距离硬拉镜头 */
        const playerPos = player.body.translation()
        const targetPos = target.body.translation()
        if (Math.hypot(targetPos.x - playerPos.x, targetPos.z - playerPos.z) > LOCK_ON_RELEASE_RADIUS) {
            release()
            return undefined
        }
        return target
    }

    const getAimPoint = (): Vector3 | undefined => {
        const target = resolveTarget()
        if (!target) return undefined
        const pointCount = resolveLockPointPositions(target, pointPool)
        /* 锁定期间配置被改小：锁定点已不存在，解除锁定避免对错误位置硬拉镜头 */
        if (targetPointIndex >= pointCount) {
            release()
            return undefined
        }
        aimPoint.copy(pointPool[targetPointIndex])
        return aimPoint
    }

    return {toggle, release, getAimPoint}
}
