import type {SharedWorld} from './world.ts'
import {clearAllForces} from './rapier_utils.ts'
import {FIXED_TIME_STEP, MAX_DT, MAX_SUB_STEPS} from './constants.ts'

/** 一个渲染帧内应执行的物理步数与插值余量 */
export interface FixedStepAdvance {
    /** 本渲染帧执行的物理步数（0..MAX_SUB_STEPS） */
    readonly steps: number
    /** 渲染插值系数 [0, 1)：0 = 上一物理步，越接近 1 越接近本步末 */
    readonly alpha: number
}

export interface FixedStepClock {
    /**
     * 按真实帧间隔推进累加器：步数由累计时间决定，**不追赶**。
     * 达到 `MAX_SUB_STEPS` 仍未还清的时间作为欠账丢弃（时间膨胀），避免死亡螺旋。
     */
    readonly advance: (delta: number) => FixedStepAdvance
}

/** 固定步时钟（累加器 + 欠账丢弃） */
export const createFixedStepClock = (): FixedStepClock => {
    let accumulator = 0
    const advance = (delta: number): FixedStepAdvance => {
        accumulator += Math.min(Math.max(delta, 0), MAX_DT)
        let steps = 0
        while (accumulator >= FIXED_TIME_STEP && steps < MAX_SUB_STEPS) {
            accumulator -= FIXED_TIME_STEP
            steps += 1
        }
        if (steps === MAX_SUB_STEPS) accumulator = 0
        return {steps, alpha: accumulator / FIXED_TIME_STEP}
    }
    return {advance}
}

/** 参与固定子步步进的实体系统：每步 preSync / fixedUpdate，步末捕获插值状态，渲染帧写插值变换 */
export interface SteppableSystem {
    readonly preSync?: (dt: number, time: number) => void
    /** 物理步：把真实物理位置写到渲染根（碰撞体同步前调用） */
    readonly syncTrueTransforms?: () => void
    /** 每个物理步的游戏逻辑（状态机 / 动画 / 计时器） */
    readonly fixedUpdate?: (dt: number) => void
    /** 每个物理步末记录渲染插值状态 */
    readonly captureRenderState?: () => void
    readonly syncPositions: (alpha?: number) => void
}

export interface FixedStepStepperOptions {
    /** 每个物理步步进前（移动平台瞬移 / 乘客携带） */
    readonly beforeStep?: (dt: number) => void
}

/**
 * 独立 `SharedWorld` 的固定子步运行器（物理节拍镜像 `main.ts` play 模式）。
 *
 * 创建时即注册「每个物理子步结束后清除所有刚体累积力」——与 `main.ts` / 角色测试 `harness` 一致。
 * 陷阱：Rapier 的 `addForce` 不会自动清除，本项目所有施力均为每帧瞬态语义（含 idle / 站定攻击的
 * 坡面反重力力）；漏注册会让反重力力残留、抵消重力，角色跳跃后上升速度不再衰减而持续升空。
 *
 * 时序（每物理步）：`beforeStep` → `world.step` → `eventBus.drain` → 各系统 `preSync` →
 * `syncTrueTransforms` → `fixedUpdate` → `captureRenderState`。全部步结束后按 `alpha` 写渲染插值变换。
 *
 * @returns `(dt, time) => alpha`：推进世界并同步各系统，返回渲染插值系数
 */
export const createFixedStepStepper = (
    shared: SharedWorld,
    systems: readonly SteppableSystem[],
    options?: FixedStepStepperOptions,
): ((dt: number, time: number) => number) => {
    shared.eventBus.onStepEnd(() => clearAllForces(shared.world))
    const clock = createFixedStepClock()
    let simTime = 0
    return (dt, _time) => {
        const {steps, alpha} = clock.advance(dt)
        for (let s = 0; s < steps; s++) {
            options?.beforeStep?.(FIXED_TIME_STEP)
            shared.world.step(shared.eventQueue)
            shared.eventBus.drain()
            for (const system of systems) system.preSync?.(FIXED_TIME_STEP, simTime)
            for (const system of systems) system.syncTrueTransforms?.()
            for (const system of systems) system.fixedUpdate?.(FIXED_TIME_STEP)
            for (const system of systems) system.captureRenderState?.()
            simTime += FIXED_TIME_STEP
        }
        for (const system of systems) system.syncPositions(alpha)
        return alpha
    }
}
