import type {BoxConfig, ElasticRuntime} from '../../types'
import {ELASTIC_COLLISION_COOLDOWN, IMPACT_DEFORM_SCALE, GRAVITY_SQUASH} from '../constants.ts'

/** 初始化弹性特性运行时状态（可携带加载存档时的形变 / 速度） */
export const createElasticRuntime = (
    baseHeight: number,
    options?: {def?: [number, number, number]; vel?: [number, number, number]},
): ElasticRuntime => ({
    def: options?.def !== undefined
        ? [options.def[0], options.def[1], options.def[2]]
        : [0, -baseHeight * GRAVITY_SQUASH, 0],
    vel: options?.vel !== undefined ? [options.vel[0], options.vel[1], options.vel[2]] : [0, 0, 0],
    cooldowns: new Map<number, number>(),
})

/** 碰撞冷却符号测试：冷却中返回 false，否则登记冷却并返回 true */
export const consumeElasticCooldown = (rt: ElasticRuntime, otherBodyHandle: number): boolean => {
    if ((rt.cooldowns.get(otherBodyHandle) ?? 0) > 0) return false
    rt.cooldowns.set(otherBodyHandle, ELASTIC_COLLISION_COOLDOWN)
    return true
}

/** 依据碰撞法线（本箱局部系）把撞击速度转为沿主轴方向的形变速度 */
export const applyElasticImpact = (rt: ElasticRuntime, localNormal: {x: number; y: number; z: number}, relVel: number): void => {
    const absN = [Math.abs(localNormal.x), Math.abs(localNormal.y), Math.abs(localNormal.z)]
    const axis = absN.indexOf(Math.max(...absN))
    rt.vel[axis] -= relVel * IMPACT_DEFORM_SCALE
}

const clamp = (v: number, min: number, max: number): number =>
    v < min ? min : v > max ? max : v

/** 体积守恒：按当前形变量等比缩放，使总体积保持不变 */
const conserveVolume = (rt: ElasticRuntime, base: readonly [number, number, number]): void => {
    const volume0 = base[0] * base[1] * base[2]
    const vx = Math.max(0.001, base[0] + rt.def[0])
    const vy = Math.max(0.001, base[1] + rt.def[1])
    const vz = Math.max(0.001, base[2] + rt.def[2])
    const volumeA = vx * vy * vz
    if (volumeA < 0.0001) return
    const scale = Math.cbrt(volume0 / volumeA)
    rt.def[0] = vx * scale - base[0]
    rt.def[1] = vy * scale - base[1]
    rt.def[2] = vz * scale - base[2]
}

/** 弹簧-阻尼积分一步（自重压缩 + 体积守恒） */
export const stepElastic = (rt: ElasticRuntime, config: BoxConfig, mass: number, dt: number): void => {
    for (const [key, val] of rt.cooldowns) {
        const next = val - dt
        if (next <= 0) rt.cooldowns.delete(key)
        else rt.cooldowns.set(key, next)
    }

    const elastic = config.elastic
    if (elastic === undefined || mass === 0) return

    const base: [number, number, number] = [config.width, config.height, config.depth]
    const omega = Math.sqrt(elastic.stiffness / mass)
    const zeta = elastic.dampingRatio

    for (let a = 0; a < 3; a++) {
        const aSpring = -omega * omega * rt.def[a]
        const aDamp = -2 * zeta * omega * rt.vel[a]
        rt.vel[a] += (aSpring + aDamp) * dt
        rt.def[a] += rt.vel[a] * dt

        const maxDef = elastic.maxDeformFraction * base[a]
        const clamped = clamp(rt.def[a], -maxDef, maxDef)
        if (clamped !== rt.def[a]) {
            rt.def[a] = clamped
            rt.vel[a] = 0
        }
    }

    const gravityTarget = -base[1] * GRAVITY_SQUASH
    rt.def[1] += (gravityTarget - rt.def[1]) * Math.min(1, dt * 5)

    conserveVolume(rt, base)
}
