import type {CharacterEntity} from '../../../../character/types.ts'
import type {NavRunContext, NavState, NavStateHandler, NavSensor, NavSenseOutput} from './types.ts'
import {DEFAULT_CHECK_RADIUS, DEFAULT_CHECK_DISTANCE, DEFAULT_STUCK_TIMEOUT} from './constants.ts'
import {STEER_ANGLE_MIN, STEER_ANGLE_MAX, STEER_ANGLE_STEP} from './constants.ts'

/**
 * 在原始方向附近搜索一个畅通的方向角度
 * 返回偏转角（弧度），正=左，负=右；若无畅通方向返回 null
 */
const findSteerAngle = (
    entity: CharacterEntity,
    forwardX: number,
    forwardZ: number,
    sensor: NavSensor,
    config: NavRunContext['config'],
    preferDirection: number,
): number | null => {
    const fLen = Math.hypot(forwardX, forwardZ)
    if (fLen < 0.001) return null

    const fx = forwardX / fLen
    const fz = forwardZ / fLen

    /* 优先尝试偏好侧 */
    for (let a = STEER_ANGLE_STEP; a <= STEER_ANGLE_MAX; a += STEER_ANGLE_STEP) {
        const angle = a * preferDirection
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const tx = fx * cosA - fz * sinA
        const tz = fx * sinA + fz * cosA

        const result = sensor.sense(entity, tx, tz, config)
        if (result.result === 'clear') {
            return angle
        }
    }

    /* 尝试另一侧 */
    for (let a = STEER_ANGLE_STEP; a <= STEER_ANGLE_MAX; a += STEER_ANGLE_STEP) {
        const angle = -a * preferDirection
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const tx = fx * cosA - fz * sinA
        const tz = fx * sinA + fz * cosA

        const result = sensor.sense(entity, tx, tz, config)
        if (result.result === 'clear') {
            return angle
        }
    }

    return null
}

/* ── navigating 状态 ── */

/** 获取传感器结果：优先使用 processNav 预计算缓存，否则实时调用 */
const senseOrCache = (
    ctx: NavRunContext,
    entity: CharacterEntity,
    sensor: NavSensor,
    intendedDX: number,
    intendedDZ: number,
): NavSenseOutput => {
    if (ctx.preSense !== null) return ctx.preSense
    return sensor.sense(entity, intendedDX, intendedDZ, ctx.config)
}

const navigatingHandler: NavStateHandler = {
    enter: (_ctx, _entity) => {},
    update: (dt, ctx, entity, sensor, intendedDX, intendedDZ) => {
        ctx.stateTime += dt

        if (Math.hypot(intendedDX, intendedDZ) < 0.001) {
            return {dx: 0, dz: 0, jump: false}
        }

        const fLen = Math.hypot(intendedDX, intendedDZ)
        const fx = intendedDX / fLen
        const fz = intendedDZ / fLen

        const sense = senseOrCache(ctx, entity, sensor, intendedDX, intendedDZ)

        switch (sense.result) {
            case 'clear':
                return {dx: intendedDX, dz: intendedDZ, jump: false}
            case 'blocked_low':
                return {dx: intendedDX, dz: intendedDZ, jump: true}
            case 'blocked_pit':
            case 'blocked_wall':
                /* 尝试绕行 */
                if (sense.leftClear && sense.rightClear) {
                    ctx.steerDirection = Math.random() < 0.5 ? 1 : -1
                } else if (sense.leftClear) {
                    ctx.steerDirection = 1
                } else if (sense.rightClear) {
                    ctx.steerDirection = -1
                } else {
                    return {dx: 0, dz: 0, jump: false}
                }

                const angle = findSteerAngle(entity, fx, fz, sensor, ctx.config, ctx.steerDirection)
                if (angle !== null) {
                    ctx.steerAngle = angle
                    const cosA = Math.cos(angle)
                    const sinA = Math.sin(angle)
                    const sx = fx * cosA - fz * sinA
                    const sz = fx * sinA + fz * cosA
                    return {dx: sx, dz: sz, jump: false}
                }
                return {dx: 0, dz: 0, jump: false}
        }
    },
    exit: () => {},
    transitions: [
        {
            to: 'steering',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                if (Math.hypot(intendedDX, intendedDZ) < 0.001) return false
                const sense = senseOrCache(ctx, entity, sensor, intendedDX, intendedDZ)
                return (sense.result === 'blocked_wall' || sense.result === 'blocked_pit')
                    && (sense.leftClear || sense.rightClear)
            },
        },
        {
            to: 'jumping',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                if (Math.hypot(intendedDX, intendedDZ) < 0.001) return false
                const sense = senseOrCache(ctx, entity, sensor, intendedDX, intendedDZ)
                return sense.result === 'blocked_low'
            },
        },
        {
            to: 'stuck',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                if (Math.hypot(intendedDX, intendedDZ) < 0.001) return false
                const sense = senseOrCache(ctx, entity, sensor, intendedDX, intendedDZ)
                return (sense.result === 'blocked_wall' || sense.result === 'blocked_pit')
                    && !sense.leftClear && !sense.rightClear
            },
        },
    ],
}

/* ── steering 状态 ── */
const steeringHandler: NavStateHandler = {
    enter: (ctx, entity) => {
        ctx.steerAngle = STEER_ANGLE_MIN * ctx.steerDirection
        ctx.lastPosX = entity.body.position.x
        ctx.lastPosZ = entity.body.position.z
    },
    update: (dt, ctx, entity, sensor, intendedDX, intendedDZ) => {
        ctx.stateTime += dt

        if (Math.hypot(intendedDX, intendedDZ) < 0.001) {
            return {dx: 0, dz: 0, jump: false}
        }

        const fLen = Math.hypot(intendedDX, intendedDZ)
        const fx = intendedDX / fLen
        const fz = intendedDZ / fLen

        /* 当前偏转方向 */
        const cosA = Math.cos(ctx.steerAngle)
        const sinA = Math.sin(ctx.steerAngle)
        const sx = fx * cosA - fz * sinA
        const sz = fx * sinA + fz * cosA

        /* 检查偏转方向是否畅通 */
        const sense = sensor.sense(entity, sx, sz, ctx.config)

        if (sense.result === 'clear') {
            /* 路径已恢复，检查原方向是否也畅通 */
            const origSense = sensor.sense(entity, fx, fz, ctx.config)
            if (origSense.result === 'clear') {
                /* 原方向恢复，逐步回正 */
                ctx.steerAngle *= 0.5
                if (Math.abs(ctx.steerAngle) < STEER_ANGLE_STEP) {
                    ctx.steerAngle = 0
                    return {dx: intendedDX, dz: intendedDZ, jump: false}
                }
            }
            return {dx: sx, dz: sz, jump: false}
        }

        /* 偏转方向被堵，尝试调整角度 */
        const newAngle = findSteerAngle(entity, fx, fz, sensor, ctx.config, ctx.steerDirection)
        if (newAngle !== null) {
            ctx.steerAngle = newAngle
            const ca = Math.cos(ctx.steerAngle)
            const sa = Math.sin(ctx.steerAngle)
            return {dx: fx * ca - fz * sa, dz: fx * sa + fz * ca, jump: false}
        }

        /* 完全被堵 */
        return {dx: 0, dz: 0, jump: false}
    },
    exit: () => {},
    transitions: [
        {
            to: 'navigating',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                if (Math.hypot(intendedDX, intendedDZ) < 0.001) return false
                const sense = sensor.sense(entity, intendedDX, intendedDZ, ctx.config)
                return sense.result === 'clear'
            },
        },
        {
            to: 'jumping',
            guard: (ctx, entity, sensor, _intendedDX, _intendedDZ) => {
                /* 检测当前偏转方向前方是否有矮障碍 */
                const fLen = Math.hypot(_intendedDX, _intendedDZ)
                if (fLen < 0.001) return false
                const fx = _intendedDX / fLen
                const fz = _intendedDZ / fLen
                const cosA = Math.cos(ctx.steerAngle)
                const sinA = Math.sin(ctx.steerAngle)
                const sx = fx * cosA - fz * sinA
                const sz = fx * sinA + fz * cosA
                const sense = sensor.sense(entity, sx, sz, ctx.config)
                return sense.result === 'blocked_low'
            },
        },
        {
            to: 'stuck',
            guard: (_ctx, entity, _sensor, intendedDX, intendedDZ) => {
                if (Math.hypot(intendedDX, intendedDZ) < 0.001) return false
                /* 原地未移动超过 1.5s */
                const moved = Math.hypot(
                    entity.body.position.x - _ctx.lastPosX,
                    entity.body.position.z - _ctx.lastPosZ,
                ) > 0.01
                if (moved) {
                    _ctx.lastPosX = entity.body.position.x
                    _ctx.lastPosZ = entity.body.position.z
                    return false
                }
                return _ctx.stateTime > 1.5
            },
        },
    ],
}

/* ── jumping 状态 ── */
const jumpingHandler: NavStateHandler = {
    enter: (_ctx, _entity) => {},
    update: (dt, ctx, entity, sensor, intendedDX, intendedDZ) => {
        ctx.stateTime += dt

        const fLen = Math.hypot(intendedDX, intendedDZ)
        if (fLen < 0.001) {
            return {dx: 0, dz: 0, jump: false}
        }

        /* 跳跃过程中保持方向，但不再重复触发 jump */
        if (entity.isOnGround && ctx.stateTime > 0.3) {
            /* 已落地，检查前方 */
            const sense = sensor.sense(entity, intendedDX / fLen, intendedDZ / fLen, ctx.config)
            if (sense.result === 'clear') {
                return {dx: intendedDX, dz: intendedDZ, jump: false}
            }
            /* 落地后仍然受阻，不重复跳跃，交由 transition → stuck 处理 */
            return {dx: intendedDX, dz: intendedDZ, jump: false}
        }

        /* 空中阶段：保持方向并维持 jump */
        if (ctx.stateTime < 0.5) {
            return {dx: intendedDX, dz: intendedDZ, jump: true}
        }

        return {dx: intendedDX, dz: intendedDZ, jump: false}
    },
    exit: () => {},
    transitions: [
        {
            to: 'navigating',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                if (ctx.stateTime < 0.3) return false
                if (!entity.isOnGround) return false
                const fLen = Math.hypot(intendedDX, intendedDZ)
                if (fLen < 0.001) return true
                const sense = sensor.sense(entity, intendedDX / fLen, intendedDZ / fLen, ctx.config)
                return sense.result === 'clear'
            },
        },
        {
            to: 'stuck',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                if (ctx.stateTime < 0.5) return false
                if (!entity.isOnGround) return false
                const fLen = Math.hypot(intendedDX, intendedDZ)
                if (fLen < 0.001) return false
                const sense = sensor.sense(entity, intendedDX / fLen, intendedDZ / fLen, ctx.config)
                return sense.result !== 'clear'
            },
        },
    ],
}

/* ── stuck 状态 ── */
const stuckHandler: NavStateHandler = {
    enter: (_ctx, _entity) => {},
    update: (dt, ctx, entity, sensor, intendedDX, intendedDZ) => {
        ctx.stateTime += dt

        /* 定期检查路径是否恢复 */
        if (ctx.stateTime > 1.0) {
            const fLen = Math.hypot(intendedDX, intendedDZ)
            if (fLen > 0.001) {
                const sense = sensor.sense(entity, intendedDX / fLen, intendedDZ / fLen, ctx.config)
                if (sense.result === 'clear') {
                    /* 路径恢复 */
                    return {dx: intendedDX, dz: intendedDZ, jump: false}
                }
            }
            /* 重置检查计时器 */
            ctx.stateTime = 0
        }

        return {dx: 0, dz: 0, jump: false}
    },
    exit: () => {},
    transitions: [
        {
            to: 'navigating',
            guard: (ctx, entity, sensor, intendedDX, intendedDZ) => {
                const fLen = Math.hypot(intendedDX, intendedDZ)
                if (fLen < 0.001) return false
                const sense = sensor.sense(entity, intendedDX / fLen, intendedDZ / fLen, ctx.config)
                return sense.result === 'clear'
            },
        },
    ],
}

const NAV_HANDLERS: Record<NavState, NavStateHandler> = {
    navigating: navigatingHandler,
    steering: steeringHandler,
    jumping: jumpingHandler,
    stuck: stuckHandler,
}

/**
 * 创建默认导航运行时上下文
 */
export const createNavRunContext = (enabled: boolean): NavRunContext => ({
    state: 'navigating',
    stateTime: 0,
    steerAngle: 0,
    steerDirection: 1,
    stuckTimer: 0,
    lastPosX: 0,
    lastPosZ: 0,
    preSense: null,
    config: {
        checkRadius: DEFAULT_CHECK_RADIUS,
        checkDistance: DEFAULT_CHECK_DISTANCE,
        stuckTimeout: DEFAULT_STUCK_TIMEOUT,
    },
    enabled,
})

/**
 * 运行导航感知层一帧
 * 根据当前 NavFSM 状态调用对应 handler 的 transitions → update
 * 返回修正后的 (dx, dz, jump)
 */
export const processNav = (
    dt: number,
    ctx: NavRunContext,
    entity: CharacterEntity,
    sensor: NavSensor,
    intendedDX: number,
    intendedDZ: number,
): {dx: number; dz: number; jump: boolean} => {
    if (!ctx.enabled) {
        /* legacy 卡住检测 */
        if (Math.hypot(intendedDX, intendedDZ) > 0.001) {
            const moved = Math.hypot(
                entity.body.position.x - ctx.lastPosX,
                entity.body.position.z - ctx.lastPosZ,
            ) > 0.01
            if (moved) {
                ctx.stuckTimer = 0
                ctx.lastPosX = entity.body.position.x
                ctx.lastPosZ = entity.body.position.z
            } else {
                ctx.stuckTimer += dt
            }
            if (ctx.stuckTimer > ctx.config.stuckTimeout) {
                return {dx: 0, dz: 0, jump: false}
            }
        }
        return {dx: intendedDX, dz: intendedDZ, jump: false}
    }

    let handler = NAV_HANDLERS[ctx.state]

    /* 预计算传感器结果，避免 transition guard 与 update 重复调用 sense() */
    ctx.preSense = Math.hypot(intendedDX, intendedDZ) > 0.001
        ? sensor.sense(entity, intendedDX, intendedDZ, ctx.config)
        : null

    /* 检查状态转移 */
    for (const t of handler.transitions) {
        if (t.guard(ctx, entity, sensor, intendedDX, intendedDZ)) {
            handler.exit(ctx, entity)
            ctx.state = t.to
            ctx.stateTime = 0
            handler = NAV_HANDLERS[ctx.state]
            handler.enter(ctx, entity)
            break
        }
    }

    /* 执行当前状态 */
    return handler.update(dt, ctx, entity, sensor, intendedDX, intendedDZ)
}
