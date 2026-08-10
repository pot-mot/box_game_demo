import RAPIER from '@dimforge/rapier3d-compat'
import { GRAVITY, GROUND_Y } from './constants.ts'

export interface SharedWorld {
    /** Rapier 物理世界 */
    readonly world: RAPIER.World
    /** 碰撞事件队列 —— 弹性箱子 / 可破坏箱子 / 地面检测 共用 */
    readonly eventQueue: RAPIER.EventQueue
    /** 地面刚体引用 */
    readonly groundBody: RAPIER.RigidBody
}

/** 创建 Rapier 物理世界（地面），供各实体系统共享 */
export const createSharedWorld = (): SharedWorld => {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
    const eventQueue = new RAPIER.EventQueue(true)

    // 地面：大而扁的静态盒子（Rapier 无 Plane/halfspace collider）
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
    groundDesc.setTranslation(0, GROUND_Y - 1, 0)
    const groundBody = world.createRigidBody(groundDesc)
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(200, 1, 200).setFriction(0.5),
        groundBody,
    )

    return { world, eventQueue, groundBody }
}
