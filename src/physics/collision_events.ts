import type RAPIER from '@dimforge/rapier3d-compat'

/** 碰撞事件处理器（参数与 Rapier drainCollisionEvents 一致） */
export type CollisionEventHandler = (handle1: number, handle2: number, started: boolean) => void

/**
 * 碰撞事件总线：共享 eventQueue 的唯一排空点。
 *
 * main.ts 在每次 world.step() 之后立即调用 drain()：
 * 1. 先把事件广播给所有订阅者（此时刚体状态为该子步结算后的状态）；
 * 2. 再执行步进钩子（用于刷新「撞击前速度」快照，供下一子步的事件使用）。
 *
 * 同时解决两个问题：
 * 1. EventQueue(autoDrain=true) 在每次 step 前自动清空队列 —— 若只在子步循环结束后
 *    排空一次，非最后一个子步产生的事件（如落地 contact start）会永久丢失；
 * 2. 多个系统各自 drain 同一个队列会互相争抢 —— 先 drain 的系统拿走全部事件，
 *    后 drain 的系统什么也拿不到。
 */
export interface CollisionEventBus {
    subscribe(handler: CollisionEventHandler): void
    /** 订阅步进钩子：每个物理子步排空事件后调用（用于刷新速度快照等） */
    onStepEnd(handler: () => void): void
    /** 排空事件队列并广播给所有订阅者（每物理子步调用一次） */
    drain(): void
}

export const createCollisionEventBus = (eventQueue: RAPIER.EventQueue): CollisionEventBus => {
    const handlers: CollisionEventHandler[] = []
    const stepEndHandlers: Array<() => void> = []
    return {
        subscribe: (handler) => {
            handlers.push(handler)
        },
        onStepEnd: (handler) => {
            stepEndHandlers.push(handler)
        },
        drain: () => {
            eventQueue.drainCollisionEvents((handle1, handle2, started) => {
                for (const handler of handlers) {
                    handler(handle1, handle2, started)
                }
            })
            for (const handler of stepEndHandlers) {
                handler()
            }
        },
    }
}
