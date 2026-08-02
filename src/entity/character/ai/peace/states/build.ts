import {Vec3} from 'cannon-es'
import type {PeaceStateHandler} from '../types.ts'
import {isBuildConfig, type BoxSpawnEntry} from '../../../../../character/ai_strategy/types.ts'

const _pos = new Vec3()

/** 按概率加权随机选择箱型 */
const selectBoxType = (entries: readonly BoxSpawnEntry[]): BoxSpawnEntry | undefined => {
    const totalProb = entries.reduce((sum, e) => sum + e.probability, 0)
    if (totalProb <= 0) return undefined
    let r = Math.random() * totalProb
    for (const entry of entries) {
        r -= entry.probability
        if (r <= 0) return entry
    }
    return entries[entries.length - 1]
}

/** 在范围内随机取值 */
const randBetween = (min: number, max: number): number =>
    min + Math.random() * (max - min)

export const buildHandler: PeaceStateHandler = {
    enter: (ctx, character) => {
        if (!ctx.spawnBox) return

        const cfg = ctx.peaceConfig
        if (!isBuildConfig(cfg)) return

        const entry = selectBoxType(cfg.boxTypes)
        if (!entry) return

        const w = randBetween(entry.minWidth, entry.maxWidth)
        const h = randBetween(entry.minHeight, entry.maxHeight)
        const d = randBetween(entry.minDepth, entry.maxDepth)

        /* 在角色周围随机位置放置 */
        const pos = character.body.position
        const angle = Math.random() * Math.PI * 2
        const dist = 1 + Math.random() * 1.5
        const bx = pos.x + Math.cos(angle) * dist
        const bz = pos.z + Math.sin(angle) * dist

        _pos.set(bx, pos.y, bz)

        ctx.spawnBox(entry, _pos.x, _pos.y, _pos.z, {width: w, height: h, depth: d})
    },
    update: () => {},
    exit: () => {},
    transitions: [
        {
            to: 'patrol',
            guard: () => true,
        },
    ],
}
