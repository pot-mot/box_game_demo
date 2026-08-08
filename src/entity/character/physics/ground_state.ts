import {type Body, type Vec3} from 'cannon-es'
import {GROUND_KEEP_TIME} from './constants.ts'

export interface GroundState {
    isOnGround: boolean
    groundNormal: {x: number; y: number; z: number}
    groundKeepTimer: number
}

/** 无接触时的默认法线（朝上） */
export const DEFAULT_GROUND_NORMAL = {x: 0, y: 1, z: 0}

/** 接触信息最小接口（兼容 cannon-es Contact） */
export interface GroundContactLike {
    ni: Vec3 | null
    bi: Body
    bj: Body
}

/**
 * 根据接触列表解析地面状态（含郊狼时间）：
 * - 有朝上接触 → 刷新法线并重置郊狼计时
 * - 无接触但宽限期未过 → 保持着地与上一帧法线，递减计时
 * - 持续脱离超过宽限期 → 真正判定为脱离地面
 */
export const resolveGroundState = (
    contacts: readonly GroundContactLike[],
    body: Body,
    prev: GroundState,
    dt: number,
): GroundState => {
    /* 任意向上法线的接触即算着地，不设坡度阈值（坡度判定在状态机层） */
    let bestNy = -Infinity
    let bestNx = 0
    let bestNz = 0

    for (const c of contacts) {
        if (!c.ni) continue
        if (c.bi !== body && c.bj !== body) continue
        const flip = c.bi === body ? -1 : 1
        const ny = c.ni.y * flip
        const nx = c.ni.x * flip
        const nz = c.ni.z * flip
        if (ny <= 0) continue
        if (ny > bestNy) {
            bestNy = ny
            /* +0 消除 -0（0 × flip 可能产生 -0，toEqual 严格区分） */
            bestNx = nx + 0
            bestNz = nz + 0
        }
    }

    if (bestNy > 0) {
        return {
            isOnGround: true,
            groundNormal: {x: bestNx, y: bestNy, z: bestNz},
            groundKeepTimer: GROUND_KEEP_TIME,
        }
    }
    if (prev.groundKeepTimer > 0) {
        /* 郊狼时间：短暂脱离仍判定为着地，保持上一帧法线 */
        const remaining = Math.max(0, prev.groundKeepTimer - dt)
        if (remaining > 0) {
            return {
                isOnGround: true,
                groundNormal: prev.groundNormal,
                groundKeepTimer: remaining,
            }
        }
        /* 持续脱离超过宽限期：真正判定为脱离地面 */
        return {
            isOnGround: false,
            groundNormal: DEFAULT_GROUND_NORMAL,
            groundKeepTimer: 0,
        }
    }
    return {
        isOnGround: false,
        groundNormal: DEFAULT_GROUND_NORMAL,
        groundKeepTimer: 0,
    }
}
