import type {AttackModuleId, AttackModuleRuntime} from '../weapon/attack_module.ts'
import type {WeaponRuntime} from '../weapon/weapon_runtime.ts'
import {sameWeaponClass, weaponAttacksOf} from '../weapon/catalog.ts'
import type {AttackSegment, WeaponAttacks} from '../weapon/attack_chain.ts'
import type {WeaponConfig} from '../weapon/catalog.ts'

/**
 * 从角色**全部武器槽**解析可用攻击模组。
 *
 * - 每个槽位武器的 `attackModules` 声明自己的模组；
 * - `requiredSlots` 必须已装备（如龙吐息要求 breath 槽）；
 * - 人形 `dual_wield` 额外要求副手为同类近战武器；
 * - `heavySlot` 让模组的重击链来自另一槽（“轻爪重吐息”），轻/空仍用主槽武器。
 *
 * 同 id 模组由声明顺序先出现者胜出（体形数据应保证全局唯一）。
 */
export const resolveAttackModules = (
    slotRuntimes: ReadonlyMap<string, WeaponRuntime>,
    offhandSlot = 'off_hand',
): ReadonlyMap<AttackModuleId, AttackModuleRuntime> => {
    const modules = new Map<AttackModuleId, AttackModuleRuntime>()
    const offhand = slotRuntimes.get(offhandSlot)?.weapon
    for (const [slot, runtime] of slotRuntimes) {
        /* 副手槽只提供双持命中/外观，不单独贡献模组（否则副手武器会抢走主武器模组） */
        if (slot === offhandSlot) continue
        for (const def of runtime.weapon.attackModules) {
            if (modules.has(def.id)) continue
            if (def.requiredSlots !== undefined && def.requiredSlots.some(required => !slotRuntimes.has(required))) continue
            if (def.holdMode === 'dual_wield') {
                const offhandRuntime = slotRuntimes.get(offhandSlot)
                if (offhand === undefined || offhandRuntime === undefined || !sameWeaponClass(runtime.weapon, offhand)) continue
            }
            const base = weaponAttacksOf(runtime.weapon, def.id)
            const composed = def.heavySlot !== undefined
                ? composeWithHeavySlot(base, slotRuntimes.get(def.heavySlot))
                : {attacks: base, attackWeapons: new Map<string, WeaponConfig>()}
            modules.set(def.id, {
                def,
                primarySlot: slot,
                primaryWeapon: runtime.weapon,
                attacks: composed.attacks,
                attackWeapons: composed.attackWeapons,
            })
        }
    }
    return modules
}

/** 用额外槽位的重击链替换基础链的 heavy 链（轻/空保持主槽） */
export const composeWithHeavySlot = (
    base: WeaponAttacks,
    heavyRuntime: WeaponRuntime | undefined,
): {readonly attacks: WeaponAttacks; readonly attackWeapons: ReadonlyMap<string, WeaponConfig>} => {
    if (heavyRuntime === undefined) return {attacks: base, attackWeapons: new Map()}
    const heavySource = weaponAttacksOf(heavyRuntime.weapon)
    if (heavySource.chains.heavy.steps.length === 0) return {attacks: base, attackWeapons: new Map()}
    const segments: Record<string, AttackSegment> = {...base.segments}
    const attackWeapons = new Map<string, WeaponConfig>()
    for (const segmentId of heavySource.chains.heavy.steps) {
        const segment = heavySource.segments[segmentId]
        if (segment === undefined) continue
        segments[segmentId] = {
            ...segment,
            attackWeaponId: heavyRuntime.weapon.id,
            attackSlotKey: `weapon:${heavyRuntime.weapon.equipBodyParts[0] ?? 'breath'}`,
        }
        attackWeapons.set(segmentId, heavyRuntime.weapon)
    }
    return {
        attacks: {
            segments,
            chains: {
                light: base.chains.light,
                heavy: heavySource.chains.heavy,
                air: base.chains.air,
            },
        },
        attackWeapons,
    }
}
