import type RAPIER from '@dimforge/rapier3d-compat'
import type {RapVector3} from './rapier_utils.ts'
import type {CollisionEventBus} from './collision_events.ts'

/**
 * 刚体速度快照：每个物理子步结束时刷新（通过事件总线的步进钩子），
 * 碰撞事件发生时读取的是「撞击前」的速度 —— Rapier 在接触开始的同一子步内
 * 完成冲量求解，事件回调里读到的 linvel 已是撞击后的速度（约等于 0），
 * 无法用它计算冲击强度。
 *
 * 单例创建（main.ts），destruction / elasticity 共用，避免重复扫描全部刚体。
 */
export interface VelocitySnapshots {
    get(handle: number): RapVector3 | undefined
}

export const createVelocitySnapshots = (
    bus: CollisionEventBus,
    getBodies: () => readonly RAPIER.RigidBody[],
): VelocitySnapshots => {
    const snapshots = new Map<number, RapVector3>()
    bus.onStepEnd(() => {
        snapshots.clear()
        for (const body of getBodies()) {
            const v = body.linvel()
            snapshots.set(body.handle, {x: v.x, y: v.y, z: v.z})
        }
    })
    return {
        get: (handle) => snapshots.get(handle),
    }
}
