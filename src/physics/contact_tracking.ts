import type RAPIER from '@dimforge/rapier3d-compat'
import type {CollisionEventBus} from './collision_events.ts'

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
}

/**
 * 从活跃接触对中查询 queryCollider 与对方的实时接触信息。
 * normal 取 contactCollider 的 normal1（指向 queryCollider 外侧，即从 queryCollider 指向对方），
 * 与 cannon-es 时代 contact.ni（bi → bj）语义一致。
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
        const contactShape = queryCollider.contactCollider(otherCollider, 0.1)
        if (!contactShape) continue
        const otherBody = otherCollider.parent()
        if (!otherBody) continue
        contacts.push({
            normal: {x: contactShape.normal1.x, y: contactShape.normal1.y, z: contactShape.normal1.z},
            bodyAHandle: myBody.handle,
            bodyBHandle: otherBody.handle,
        })
    }
    return contacts
}
