/** 阵营用数字表示，所有角色（含玩家）默认出生阵营为 0 */
export type Faction = number

/** 攻击倾向策略标识 */
export type TendencyId = 'hostileAll' | 'hostileExceptSelf' | 'hostileTo' | 'hostileExcept' | 'pacifist'

/** 攻击倾向：给定自身阵营和目标阵营，返回是否攻击 */
export type AttackTendency = (selfFaction: Faction, targetFaction: Faction) => boolean

/** 存档用倾向配置 */
export interface TendencyConfig {
    tendencyId: TendencyId
    targetFactions?: Faction[]
}

/** 攻击倾向策略工厂 */
export const TENDENCIES = {
    /** 攻击所有阵营（包括自己） */
    hostileAll: (): AttackTendency =>
        () => true,

    /** 攻击除自己以外所有阵营 */
    hostileExceptSelf: (): AttackTendency =>
        (self, target) => self !== target,

    /** 只攻击指定阵营列表（不做自我排除） */
    hostileTo: (...targetFactions: Faction[]): AttackTendency =>
        (_self, target) => targetFactions.includes(target),

    /** 攻击除指定列表外所有阵营 */
    hostileExcept: (...excludeFactions: Faction[]): AttackTendency =>
        (_self, target) => !excludeFactions.includes(target),

    /** 不攻击任何人 */
    pacifist: (): AttackTendency => () => false,
}

/** 从存档配置还原 AttackTendency */
export const resolveTendency = (cfg: TendencyConfig): AttackTendency => {
    switch (cfg.tendencyId) {
        case 'hostileAll':
            return TENDENCIES.hostileAll()
        case 'hostileExceptSelf':
            return TENDENCIES.hostileExceptSelf()
        case 'hostileTo':
            return TENDENCIES.hostileTo(...(cfg.targetFactions ?? []))
        case 'hostileExcept':
            return TENDENCIES.hostileExcept(...(cfg.targetFactions ?? []))
        case 'pacifist':
            return TENDENCIES.pacifist()
    }
}

/** 阵营变更事件 */
export interface FactionChangeEvent {
    entityId: number
    oldFaction: Faction
    newFaction: Faction
}

/** 阵营事件发射器 */
export interface FactionEmitter {
    onFactionChange: (handler: (event: FactionChangeEvent) => void) => () => void
    emitFactionChange: (event: FactionChangeEvent) => void
}

export const createFactionEmitter = (): FactionEmitter => {
    const handlers: Array<(event: FactionChangeEvent) => void> = []

    const onFactionChange = (handler: (event: FactionChangeEvent) => void): (() => void) => {
        handlers.push(handler)
        return () => {
            const idx = handlers.indexOf(handler)
            if (idx !== -1) handlers.splice(idx, 1)
        }
    }

    const emitFactionChange = (event: FactionChangeEvent): void => {
        for (const h of handlers) h(event)
    }

    return {onFactionChange, emitFactionChange}
}

/** 动态切换阵营，广播变更事件 */
export const changeFaction = (
    entity: { id: number; faction: Faction },
    newFaction: Faction,
    emitter: FactionEmitter,
): void => {
    const oldFaction = entity.faction
    if (oldFaction === newFaction) return
    entity.faction = newFaction
    emitter.emitFactionChange({entityId: entity.id, oldFaction, newFaction})
}
