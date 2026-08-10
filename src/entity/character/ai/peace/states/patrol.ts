import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {PeaceStateHandler} from '../types.ts'
import {isPatrolConfig, isBuildConfig} from '../../../../../character/ai_strategy/types.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

export const patrolHandler: PeaceStateHandler = {
    enter: (ctx, _character) => {
        const cfg = ctx.peaceConfig
        if (isPatrolConfig(cfg)) {
            const r = cfg.patrolRadius * 0.8
            ctx.waypoint.x = ctx.spawnPoint.x + (Math.random() - 0.5) * r * 2
            ctx.waypoint.y = ctx.spawnPoint.y
            ctx.waypoint.z = ctx.spawnPoint.z + (Math.random() - 0.5) * r * 2
            ctx.waitTimer = 0
        } else if (isBuildConfig(cfg)) {
            ctx.buildTimer = cfg.buildInterval
        }
    },
    update: (_dt, ctx, character, setInput) => {
        const cfg = ctx.peaceConfig

        /* 建造策略：递减建造计时器 */
        if (isBuildConfig(cfg) && ctx.spawnBox) {
            ctx.buildTimer -= _dt
        }

        /* 巡逻游走逻辑（所有策略共用） */
        const pos = character.body.translation()
        v3Set(_dir, ctx.waypoint.x - pos.x, 0, ctx.waypoint.z - pos.z)
        const dist = v3Length(_dir)

        if (dist < 0.3) {
            ctx.waitTimer += _dt
            setInput(0, 0, false)
            /* 建造策略也使用 patrol 的等待时间，到达上限后重新选点 */
            const waitMax = isPatrolConfig(cfg) ? cfg.waitTimeMax : 2.5
            if (ctx.waitTimer > waitMax) {
                const r = isPatrolConfig(cfg) ? cfg.patrolRadius * 0.8 : 4
                ctx.waypoint.x = ctx.spawnPoint.x + (Math.random() - 0.5) * r * 2
                ctx.waypoint.z = ctx.spawnPoint.z + (Math.random() - 0.5) * r * 2
                ctx.waitTimer = 0
            }
        } else {
            _dir.x /= dist
            _dir.z /= dist
            setInput(_dir.x, _dir.z, false)
        }
    },
    exit: () => {},
    transitions: [
        {
            to: 'build',
            guard: (ctx) => {
                if (!isBuildConfig(ctx.peaceConfig)) return false
                return ctx.buildTimer <= 0 && ctx.spawnBox !== undefined
            },
        },
    ],
}
