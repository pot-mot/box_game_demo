import type RAPIER from '@dimforge/rapier3d-compat'
import type {CollisionEventBus} from './collision_events.ts'

/** 接触法线复用缓冲（避免每帧每接触分配） */
const _normalScratch: RAPIER.Vector = {x: 0, y: 0, z: 0}

/** 活跃接触对（碰撞开始加入、结束移除） */
export interface ActiveContactPair {
    colliderAHandle: number
    colliderBHandle: number
}

/**
 * 从碰撞事件总线维护活跃接触对集合。
 * 角色地面检测 / AI 推挤阻断 / 角色间分离共用同一份集合。
 */
export interface ContactTracker {
    /** 所有活跃接触对 */
    readonly pairs: ReadonlyMap<string, ActiveContactPair>
    /** 涉及指定碰撞体的活跃接触对 */
    pairsInvolving(colliderHandle: number): ActiveContactPair[]
    /** 清理引用已失效碰撞体的接触对（每帧调用一次） */
    prune(world: RAPIER.World): void
}

export const createContactTracker = (bus: CollisionEventBus): ContactTracker => {
    const pairs = new Map<string, ActiveContactPair>()
    bus.subscribe((handle1, handle2, started) => {
        const key = handle1 < handle2 ? `${handle1}-${handle2}` : `${handle2}-${handle1}`
        if (started) {
            pairs.set(key, {colliderAHandle: handle1, colliderBHandle: handle2})
        } else {
            pairs.delete(key)
        }
    })
    return {
        pairs,
        pairsInvolving: (colliderHandle) => {
            const result: ActiveContactPair[] = []
            for (const pair of pairs.values()) {
                if (pair.colliderAHandle === colliderHandle || pair.colliderBHandle === colliderHandle) {
                    result.push(pair)
                }
            }
            return result
        },
        /* 移除刚体不会产生 collision-stopped 事件（碎片到期、箱子销毁等），
         * 残留接触对会让 Map 增长并拖慢每帧遍历，这里按帧对账清除 */
        prune: (world) => {
            for (const [key, pair] of pairs) {
                if (!world.getCollider(pair.colliderAHandle) || !world.getCollider(pair.colliderBHandle)) {
                    pairs.delete(key)
                }
            }
        },
    }
}

/** 查询到的碰撞体接触信息（世界空间法线，从 query 碰撞体指向对方） */
export interface ColliderContact {
    normal: {readonly x: number; readonly y: number; readonly z: number}
    /** 查询碰撞体所属刚体的 handle */
    bodyAHandle: number
    /** 对方刚体的 handle */
    bodyBHandle: number
    /** 对方碰撞体的碰撞组（供按类别过滤，如地面检测排除角色接触） */
    otherCollisionGroups: number
}

/**
 * 从活跃接触对中查询 queryCollider 与对方的实时接触信息。
 * normal 统一为「从 queryCollider 指向对方」，与 cannon-es 时代 contact.ni（bi → bj）语义一致。
 *
 * 取法线策略（两个 Rapier API 各有缺陷，需配合）：
 * - 首选接触流形 `world.contactPair`：`numSolverContacts() > 0` 时法线准确（真接触），
 *   且不会像 `contactCollider` 那样在角色同时接触地面与箱体时返回被污染的对角法线
 *   （平地 ground 法线读成 (0.86,-0.28,-0.43)，行走状态据此做坡面投影会把水平速度转成
 *   大垂直速度 → 撞箱被弹飞，或误判 falling）；
 * - 回退 `contactCollider`：本版本 trimesh 接触的流形恒无求解点（`numSolverContacts()===0`）
 *   且其流形法线不可用，而 `contactCollider` 对 trimesh（斜坡地形）法线正确。
 * 两者都取不到（流形未触发 = 形状未真正接触）时跳过，避免 speculative 接触污染地面判定。
 */
export const queryColliderContacts = (
    world: RAPIER.World,
    queryCollider: RAPIER.Collider,
    pairs: Iterable<ActiveContactPair>,
): ColliderContact[] => {
    const contacts: ColliderContact[] = []
    const myHandle = queryCollider.handle
    const myBody = queryCollider.parent()
    if (!myBody) return contacts
    for (const pair of pairs) {
        if (pair.colliderAHandle !== myHandle && pair.colliderBHandle !== myHandle) continue
        const otherHandle = pair.colliderAHandle === myHandle ? pair.colliderBHandle : pair.colliderAHandle
        const otherCollider = world.getCollider(otherHandle)
        if (!otherCollider) continue
        const otherBody = otherCollider.parent()
        if (!otherBody) continue
        const otherCollisionGroups = otherCollider.collisionGroups()

        let normal: {x: number; y: number; z: number} | undefined
        let sawManifold = false
        world.contactPair(queryCollider, otherCollider, (manifold, flipped) => {
            sawManifold = true
            if (manifold.numSolverContacts() === 0) return
            /* normal() 指向流形内部第一形状 → 第二形状；flipped 时顺序相反，取「queryCollider → other」约定 */
            const n = manifold.normal(_normalScratch)
            const sign = flipped ? -1 : 1
            normal = {x: n.x * sign, y: n.y * sign, z: n.z * sign}
        })
        if (normal === undefined && sawManifold) {
            /* trimesh 回退：接触流形无求解点，改用 contactCollider 的 normal1（同为 query → other） */
            const contactShape = queryCollider.contactCollider(otherCollider, 0.1)
            if (contactShape) {
                normal = {x: contactShape.normal1.x, y: contactShape.normal1.y, z: contactShape.normal1.z}
            }
        }
        if (normal === undefined) continue
        contacts.push({
            normal,
            bodyAHandle: myBody.handle,
            bodyBHandle: otherBody.handle,
            otherCollisionGroups,
        })
    }
    return contacts
}
