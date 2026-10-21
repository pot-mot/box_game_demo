import type {AttackSegment, WeaponAttacks} from '../weapon/attack_chain.ts'
import type {WeaponConfig} from '../weapon/catalog.ts'
import type {BreathModuleConfig} from '../weapon/breath_module.ts'

/** 龙吐息运行时（独立装备槽）：模组本身 + 其重击链 */
export interface BreathRuntime {
    readonly module: BreathModuleConfig
    readonly attacks: WeaponAttacks
}

/** 组合主武器（爪击轻/空链）与吐息重击链；返回按段 id 的实际武器映射 */
export const composeClawAndBreath = (
    claw: WeaponAttacks,
    breath: BreathRuntime | undefined,
): {readonly attacks: WeaponAttacks; readonly attackWeapons: ReadonlyMap<string, WeaponConfig>} => {
    if (breath === undefined) return {attacks: claw, attackWeapons: new Map()}
    const heavy = breath.attacks.chains.heavy
    if (heavy.steps.length === 0) return {attacks: claw, attackWeapons: new Map()}
    const segments: Record<string, AttackSegment> = {...claw.segments}
    const attackWeapons = new Map<string, WeaponConfig>()
    for (const segmentId of heavy.steps) {
        const segment = breath.attacks.segments[segmentId]
        if (segment === undefined) continue
        segments[segmentId] = {...segment, attackWeaponId: breath.module.id}
        attackWeapons.set(segmentId, breath.module)
    }
    return {
        attacks: {
            segments,
            chains: {
                light: claw.chains.light,
                heavy,
                air: claw.chains.air,
            },
        },
        attackWeapons,
    }
}
