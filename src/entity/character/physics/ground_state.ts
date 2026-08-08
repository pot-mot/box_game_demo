import {type Body, type Vec3} from 'cannon-es'
import {GROUND_KEEP_TIME} from '../../../character/state_machine/constants.ts'

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
/** 法线方向簇判定阈值（点积 > 0.9 视为同一方向，夹角 < 26°） */
const VOTE_CONSISTENCY = 0.9

interface NormalVote {
    x: number
    y: number
    z: number
    count: number
}

export const resolveGroundState = (
    contacts: readonly GroundContactLike[],
    body: Body,
    prev: GroundState,
    dt: number,
): GroundState => {
    /* 任意向上法线的接触即算着地，不设坡度阈值（坡度判定在状态机层） */
    const groups: NormalVote[] = []

    for (const c of contacts) {
        if (!c.ni) continue
        if (c.bi !== body && c.bj !== body) continue
        const flip = c.bi === body ? -1 : 1
        const ny = c.ni.y * flip
        if (ny <= 0) continue
        const nx = c.ni.x * flip
        const nz = c.ni.z * flip
        /* 法线方向簇投票：多数投票抑制孤立异常法线（Box 棱-三角形棱、Box 底面面接触伪影） */
        let group: NormalVote | undefined
        for (const g of groups) {
            if (nx * g.x + ny * g.y + nz * g.z > VOTE_CONSISTENCY * Math.hypot(g.x, g.y, g.z)) {
                group = g
                break
            }
        }
        if (group) {
            group.x += nx
            group.y += ny
            group.z += nz
            group.count++
        } else {
            groups.push({x: nx, y: ny, z: nz, count: 1})
        }
    }

    /* 选数量最多的方向簇；平局时取 ny 最大（更水平的支撑优先） */
    let best: NormalVote | undefined
    for (const g of groups) {
        if (!best || g.count > best.count || (g.count === best.count && g.y > best.y)) best = g
    }

    if (best) {
        const len = Math.hypot(best.x, best.y, best.z)
        const inv = 1 / len
        return {
            isOnGround: true,
            groundNormal: {
                /* +0 消除 -0（0 × flip 可能产生 -0，toEqual 严格区分） */
                x: best.x * inv + 0,
                y: best.y * inv,
                z: best.z * inv + 0,
            },
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
