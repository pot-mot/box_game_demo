import RAPIER from '@dimforge/rapier3d-compat'
import {GRAVITY, GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from './constants.ts'
import {categoryCollisionGroups} from './collision_category.ts'
import {createCollisionEventBus, type CollisionEventBus} from './collision_events.ts'

/** 移动支撑本帧的世界系速度（由运动学平台每帧注册，供角色系统携带乘客） */
export interface MovingSupport {
    /** 线速度（m/s） */
    readonly v: {readonly x: number; readonly y: number; readonly z: number}
    /** 角速度（rad/s，绕世界轴；0 表示仅平移） */
    readonly w: {readonly x: number; readonly y: number; readonly z: number}
}

export interface SharedWorld {
    /** Rapier 物理世界 */
    readonly world: RAPIER.World
    /** 碰撞事件队列（由事件总线统一排空） */
    readonly eventQueue: RAPIER.EventQueue
    /** 碰撞事件总线 —— 每个物理子步后 drain 一次，广播给所有订阅者 */
    readonly eventBus: CollisionEventBus
    /** 地面刚体引用 */
    readonly groundBody: RAPIER.RigidBody
    /**
     * 移动支撑速度注册表（key = 支撑刚体 handle）：运动学平台（升降梯 / 闸门 / 未来载具）每帧写入自身
     * 速度（静止写 0），角色系统按「真实接触的支撑刚体」查表并携带乘客。平台移除时须删除条目。
     */
    readonly movingSupports: Map<number, MovingSupport>
}

/** 注册 / 更新移动支撑的速度（每帧调用；平台停止/暂停时传 0） */
export const setMovingSupport = (shared: SharedWorld, handle: number, support: MovingSupport): void => {
    shared.movingSupports.set(handle, support)
}

/** 删除移动支撑（平台移除时调用） */
export const deleteMovingSupport = (shared: SharedWorld, handle: number): void => {
    shared.movingSupports.delete(handle)
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

    return {world, eventQueue, eventBus, groundBody, movingSupports: new Map()}
}
