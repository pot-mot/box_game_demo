import {quatVmult, type RapVector3} from '../../../../physics/rapier_utils.ts'
import {computeFractureFromPoints} from '../../../destroyed/geometry/voronoi_fracture.ts'
import type {FragmentData} from '../../../destroyed/types'
import type {CollisionRecord, DestructibleRuntime} from '../../types'
import {
    MAX_COLLISION_HISTORY,
    MIN_FRAGMENT_COUNT,
    IMPACT_FORCE_SCALE,
    EJECT_VELOCITY_SCALE,
} from '../constants.ts'

/** 初始化可破坏特性的运行时状态（可携带加载存档时的既有运行态） */
export const createDestructibleRuntime = (
    maxHealth: number,
    options?: {health?: number; collisions?: CollisionRecord[]; collisionHistory?: CollisionRecord[]; cooldowns?: Map<number, number>},
): DestructibleRuntime => ({
    health: options?.health ?? maxHealth,
    maxHealth,
    destroyed: false,
    fragments: [],
    collisions: options?.collisions ?? [],
    collisionHistory: options?.collisionHistory ?? [],
    cooldowns: options?.cooldowns ?? new Map<number, number>(),
})

/** 记录一次碰撞（当前子步缓冲 + 有界历史） */
export const recordDestructibleCollision = (rt: DestructibleRuntime, record: CollisionRecord): void => {
    rt.collisions.push(record)
    rt.collisionHistory.push(record)
    while (rt.collisionHistory.length > MAX_COLLISION_HISTORY) {
        rt.collisionHistory.shift()
    }
}

/** 结算当前子步累积碰撞的伤害，返回是否发生变化 */
export const applyDestructibleImpacts = (rt: DestructibleRuntime, mass: number): boolean => {
    if (rt.collisions.length === 0) return false
    for (const col of rt.collisions) {
        rt.health -= col.relativeVelocity * mass * IMPACT_FORCE_SCALE
    }
    return true
}

/** 单个撞击（已换算到箱体局部坐标）：接触点 + 世界→局部的力法线 + 相对速度 */
interface LocalImpact {
    readonly contact: RapVector3
    readonly normal: RapVector3
    readonly speed: number
}

/** 把碰撞历史换算到箱体局部坐标 */
const toLocalImpacts = (
    history: readonly CollisionRecord[],
    bodyPos: {x: number; y: number; z: number},
    invRot: {x: number; y: number; z: number; w: number},
): LocalImpact[] => {
    const impacts: LocalImpact[] = []
    for (const h of history) {
        const offset = {
            x: h.contactPoint[0] - bodyPos.x,
            y: h.contactPoint[1] - bodyPos.y,
            z: h.contactPoint[2] - bodyPos.z,
        }
        const contact = {x: 0, y: 0, z: 0}
        quatVmult(contact, invRot, offset)
        const normal = {x: 0, y: 0, z: 0}
        quatVmult(normal, invRot, {x: h.normal[0], y: h.normal[1], z: h.normal[2]})
        impacts.push({contact, normal, speed: h.relativeVelocity})
    }
    return impacts
}

/**
 * 由碰撞历史生成 Voronoi 种子点（箱体局部坐标）：**受力方向驱动**。
 *
 * - 主撞击（相对速度最大）的接触点：裂纹起始处。
 * - 沿受力方向在箱体内推进的种子：撞击侧形成一块被「顶出」的碎块。
 * - 接触面切平面内的环状种子：以受力轴为中心向四周放射裂开。
 * - 其余撞击接触点作为补充种子。
 *
 * 种子数量按目标块数 `fragmentCount` 截断（原点由 `computeFractureFromPoints` 自动加入），
 * 不足时由几何层用随机种子补齐，因此块数可调、且不同受力角度产生不同碎裂方式。
 */
const buildImpactSeeds = (
    size: readonly [number, number, number],
    impacts: readonly LocalImpact[],
    fragmentCount: number,
): RapVector3[] => {
    const candidates: RapVector3[] = []
    let primary: LocalImpact | undefined
    for (const im of impacts) {
        if (primary === undefined || im.speed > primary.speed) primary = im
    }

    if (primary !== undefined) {
        const {contact, normal} = primary
        candidates.push(contact)

        const nLen = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z)
        if (nLen > 1e-6) {
            const nx = normal.x / nLen, ny = normal.y / nLen, nz = normal.z / nLen
            const minDim = Math.min(size[0], size[1], size[2])
            const depth = 0.4 * minDim

            /* 受力轴在箱内的推进种子（-n = 力指向箱体内部） */
            candidates.push({
                x: contact.x - nx * depth,
                y: contact.y - ny * depth,
                z: contact.z - nz * depth,
            })

            /* 接触面切平面内正交基：t = normalize(ref × n)，b = n × t */
            const ref = Math.abs(ny) < 0.9 ? {x: 0, y: 1, z: 0} : {x: 1, y: 0, z: 0}
            let tx = ref.y * nz - ref.z * ny
            let ty = ref.z * nx - ref.x * nz
            let tz = ref.x * ny - ref.y * nx
            const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz)
            if (tLen > 1e-6) {
                tx /= tLen; ty /= tLen; tz /= tLen
                const bx = ny * tz - nz * ty
                const by = nz * tx - nx * tz
                const bz = nx * ty - ny * tx
                const radius = 0.32 * ((size[0] + size[1] + size[2]) / 3)
                for (let k = 0; k < 3; k++) {
                    const a = (k / 3) * Math.PI * 2
                    const ca = Math.cos(a), sa = Math.sin(a)
                    candidates.push({
                        x: contact.x + (tx * ca + bx * sa) * radius - nx * depth * 0.5,
                        y: contact.y + (ty * ca + by * sa) * radius - ny * depth * 0.5,
                        z: contact.z + (tz * ca + bz * sa) * radius - nz * depth * 0.5,
                    })
                }
            }
        }
    }

    /* 其余撞击接触点作为补充种子 */
    for (const im of impacts) {
        if (im !== primary) candidates.push(im.contact)
    }

    return candidates.slice(0, Math.max(1, fragmentCount - 1))
}

/** 由碰撞历史计算 Voronoi 碎片（局部坐标）；`fragmentCount` 为目标块数 */
export const buildFragments = (
    size: readonly [number, number, number],
    history: readonly CollisionRecord[],
    bodyPos: {x: number; y: number; z: number},
    bodyRot: {x: number; y: number; z: number; w: number},
    fragmentCount: number,
): FragmentData[] => {
    const invRot = {x: -bodyRot.x, y: -bodyRot.y, z: -bodyRot.z, w: bodyRot.w}
    const impacts = toLocalImpacts(history, bodyPos, invRot)
    const seeds = buildImpactSeeds(size, impacts, fragmentCount)
    return computeFractureFromPoints(
        [size[0], size[1], size[2]],
        seeds,
        Math.max(MIN_FRAGMENT_COUNT, fragmentCount),
    )
}

/** 依据历史平均撞击速度计算碎片弹射力 */
export const ejectForceOf = (history: readonly CollisionRecord[]): number => {
    const avgSpeed = history.length > 0
        ? history.reduce((s, c) => s + c.relativeVelocity, 0) / history.length
        : 5
    return avgSpeed * EJECT_VELOCITY_SCALE
}
