import RAPIER from '@dimforge/rapier3d-compat'
import {GRAVITY, GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from './constants.ts'
import {categoryCollisionGroups} from './collision_category.ts'
import {createCollisionEventBus, type CollisionEventBus} from './collision_events.ts'

export interface SharedWorld {
    /** Rapier 物理世界 */
    readonly world: RAPIER.World
    /** 碰撞事件队列（由事件总线统一排空） */
    readonly eventQueue: RAPIER.EventQueue
    /** 碰撞事件总线 —— 每个物理子步后 drain 一次，广播给所有订阅者 */
    readonly eventBus: CollisionEventBus
    /** 地面刚体引用 */
    readonly groundBody: RAPIER.RigidBody
}

/** 创建 Rapier 物理世界（地面），供各实体系统共享 */
export const createSharedWorld = (): SharedWorld => {
    const world = new RAPIER.World({x: 0, y: GRAVITY, z: 0})
    const eventQueue = new RAPIER.EventQueue(true)
    const eventBus = createCollisionEventBus(eventQueue)

    // 地面：大而扁的静态盒子（Rapier 无 Plane/halfspace collider）
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
    groundDesc.setTranslation(0, GROUND_Y - 1, 0)
    const groundBody = world.createRigidBody(groundDesc)
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(200, 1, 200)
            .setFriction(0.5)
            /* 显式声明为默认组 + ground 类别（原先不设置 = 全 membership，交互对完全等价） */
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'ground'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        groundBody,
    )

    return {world, eventQueue, eventBus, groundBody}
}
