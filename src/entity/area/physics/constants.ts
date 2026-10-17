/** 浮力场默认值（供 schema .default() 引用） */
export const FLOAT_DEFAULTS = {
    /** 流体等效密度（相对水，1 ≈ 水）；浮力 = density × |g| × 浸没体积 */
    density: 2.0,
    /** 线性阻尼系数：阻力 = drag × 质量 × 速度（水中强阻尼） */
    drag: 4.0,
}

/** 风场默认值 */
export const WIND_DEFAULTS = {
    /** 目标流速（m/s，沿局部方向） */
    speed: 8.0,
    /** 局部方向（未归一化，运行时归一化；默认局部 +X 水平吹） */
    dirX: 1.0,
    dirY: 0.0,
    dirZ: 0.0,
    /** 速度混合系数（1/s）：速度向目标流速混合的速率 */
    drag: 4.0,
}

/** 方向重力场默认值（局部坐标加速度，默认局部 -Y 向下 = 常规重力） */
export const GRAVITY_DEFAULTS = {
    accelX: 0.0,
    accelY: -9.82,
    accelZ: 0.0,
}

/** 浮力场的角阻尼系数（与旧水体一致：×0.9 / 帧） */
export const FLOAT_ANGULAR_DRAG_COEFFICIENT = 2.0

/** 判定「环境场非零」的阈值（避免无谓写速度唤醒刚体） */
export const ENV_EPSILON = 1e-6

/** 球 / 柱重叠体积的高精度数值积分点数（Gauss–Legendre，每轴） */
export const OVERLAP_QUADRATURE_ORDER = 24
