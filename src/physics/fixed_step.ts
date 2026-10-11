import type {SharedWorld} from './world.ts'
import {clearAllForces} from './rapier_utils.ts'
import {FIXED_TIME_STEP, MAX_SUB_STEPS} from './constants.ts'

/** 参与固定子步步进的实体系统：物理子步后钩子（可选）+ 位置同步 */
export interface SteppableSystem {
    readonly preSync?: (dt: number, time: number) => void
    readonly syncPositions: () => void
}

/**
 * 独立 `SharedWorld` 的固定子步运行器（物理节拍镜像 `main.ts` play 模式）。
 *
 * 创建时即注册「每个物理子步结束后清除所有刚体累积力」——与 `main.ts` / 角色测试 `harness` 一致。
 * 陷阱：Rapier 的 `addForce` 不会自动清除，本项目所有施力均为每帧瞬态语义（含 idle / 站定攻击的
 * 坡面反重力力）；漏注册会让反重力力残留、抵消重力，角色跳跃后上升速度不再衰减而持续升空。
 * 将清力内聚到本运行器，杜绝各独立持世界（如展示模式子模块）各自遗漏。
 *
 * @param shared 独立物理世界
 * @param systems 每子步步进后需 preSync / syncPositions 的系统
 * @returns `(dt, time) => void`：按固定子步推进世界并同步各系统位置
 */
export const createFixedStepStepper = (
    shared: SharedWorld,
    systems: readonly SteppableSystem[],
): ((dt: number, time: number) => void) => {
    shared.eventBus.onStepEnd(() => clearAllForces(shared.world))
    return (dt, time) => {
        const totalSteps = Math.min(Math.max(1, Math.ceil(dt / FIXED_TIME_STEP)), MAX_SUB_STEPS)
        for (let s = 0; s < totalSteps; s++) {
            shared.world.step(shared.eventQueue)
            shared.eventBus.drain()
        }
        for (const system of systems) system.preSync?.(dt, time)
        for (const system of systems) system.syncPositions()
    }
}
