import {
    INTERACTION_MAX_DISTANCE,
    INTERACTION_MAX_ANGLE_COS,
    type InteractionTarget,
} from '../../../character/interaction/types.ts'

/**
 * 从候选交互目标中择优：距离不超过 `maxDistance`，且相对镜头前方的水平偏角余弦不低于 `minCos`，
 * 取水平距离最近者。纯函数，便于单测。
 */
export const pickInteraction = (
    targets: readonly InteractionTarget[],
    actorX: number,
    actorY: number,
    actorZ: number,
    dirX: number,
    dirZ: number,
    maxDistance = INTERACTION_MAX_DISTANCE,
    minCos = INTERACTION_MAX_ANGLE_COS,
): InteractionTarget | undefined => {
    const dirLen = Math.hypot(dirX, dirZ)
    let best: InteractionTarget | undefined
    let bestDist = Number.POSITIVE_INFINITY
    for (const t of targets) {
        const dx = t.x - actorX
        const dy = t.y - actorY
        const dz = t.z - actorZ
        const dist = Math.hypot(dx, dz)
        if (dist > maxDistance) continue
        if (Math.abs(dy) > maxDistance) continue
        if (dirLen > 0.0001 && dist > 0.0001) {
            const cos = (dx / dist) * (dirX / dirLen) + (dz / dist) * (dirZ / dirLen)
            if (cos < minCos) continue
        }
        if (dist < bestDist) {
            bestDist = dist
            best = t
        }
    }
    return best
}
