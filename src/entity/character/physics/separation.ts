/** 角色分离计算输入（两个角色的水平位置与半径） */
export interface SeparationPair {
    aiX: number
    aiZ: number
    ajX: number
    ajZ: number
    radiusA: number
    radiusB: number
}

/** 分离结果：两角色各自的位置修正与速度踢 */
export interface SeparationResult {
    aiDx: number
    aiDz: number
    aiVx: number
    aiVz: number
    ajDx: number
    ajDz: number
    ajVx: number
    ajVz: number
}

/**
 * 计算两个重叠角色的水平分离量（fixedRotation Box 永不旋转，最小间距 = 两半径之和）：
 * 不重叠返回 null；重叠时两端各移动 halfOverlap，并各施加 halfSpeed 的反向速度踢。
 */
export const computeSeparation = (pair: SeparationPair, sepSpeed: number): SeparationResult | null => {
    const dx = pair.ajX - pair.aiX
    const dz = pair.ajZ - pair.aiZ
    const dist = Math.hypot(dx, dz)
    const minDist = pair.radiusA + pair.radiusB
    if (dist >= minDist) return null
    /* 完全重合时兜底向 +X 分离 */
    const nx = dist > 0.0001 ? dx / dist : 1
    const nz = dist > 0.0001 ? dz / dist : 0
    const halfOverlap = (minDist - dist) * 0.5
    const halfSpeed = sepSpeed * 0.5
    return {
        aiDx: -nx * halfOverlap, aiDz: -nz * halfOverlap, aiVx: -nx * halfSpeed, aiVz: -nz * halfSpeed,
        ajDx: nx * halfOverlap, ajDz: nz * halfOverlap, ajVx: nx * halfSpeed, ajVz: nz * halfSpeed,
    }
}
