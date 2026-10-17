import type {RapVector3} from './rapier_utils.ts'

/**
 * 角色环境场累加器 —— 由 area 场（float / wind / gravity）逐帧写入，
 * 由角色物理在状态机之后消费。存在的意义：状态机每帧用 `setLinvel` 绝对覆写
 * 水平速度，普通 `addForce` 的水平分量会被抹掉；环境场改走「状态机之后再叠加」
 * 的通道，使气流 / 方向重力 / 浮力对角色同样生效。
 */
export interface BodyEnvironment {
    /** 额外加速度（世界坐标，m/s²，逐帧累加；角色物理在状态机之后按 dt 积分进速度） */
    accel: RapVector3
    /** 流体目标流速（世界坐标，m/s；角色物理把速度朝它混合） */
    flow: RapVector3
    /** 流体混合系数（0..1，逐帧；0 = 不混合） */
    flowBlend: number
    /** 该帧浸没比例（0..1，供状态机 / AI 读取；0 = 不在流体中） */
    fluidFraction: number
}

export const createBodyEnvironment = (): BodyEnvironment => ({
    accel: {x: 0, y: 0, z: 0},
    flow: {x: 0, y: 0, z: 0},
    flowBlend: 0,
    fluidFraction: 0,
})

/** 清零（每帧在 area 写入前调用，复用同一对象避免分配） */
export const resetBodyEnvironment = (env: BodyEnvironment): void => {
    env.accel.x = 0
    env.accel.y = 0
    env.accel.z = 0
    env.flow.x = 0
    env.flow.y = 0
    env.flow.z = 0
    env.flowBlend = 0
    env.fluidFraction = 0
}
