import {describe, expect, it} from 'vitest'
import {
    canAffordStaminaEntry,
    canEnterSustainedStamina,
    combineStaminaModifiers,
    createStaminaState,
    isStaminaExhausted,
    refreshStaminaProfile,
    resolveStaminaConfig,
    spendStaminaEntry,
    updateStamina,
} from './runtime.ts'
import {DEFAULT_STAMINA_DRAIN_PER_SEC, DEFAULT_STAMINA_ENTRY_COST, DEFAULT_STAMINA_MAX} from './constants.ts'
import type {CharacterConfig} from '../state/types.ts'
import {createCombatComponent} from '../combat/types.ts'
import {createWeaponRuntime} from '../weapon/weapon_runtime.ts'

const baseConfig = (): CharacterConfig => ({speed: 6, jumpHeight: 2, scale: 1})

describe('体力运行时', () => {
    it('缺省配置回退默认值，局部配置只覆盖对应项', () => {
        const defaults = resolveStaminaConfig(baseConfig())
        expect(defaults.max).toBe(DEFAULT_STAMINA_MAX)
        expect(defaults.entryCost.attack).toBe(DEFAULT_STAMINA_ENTRY_COST)
        expect(defaults.drainPerSec.blocking).toBe(DEFAULT_STAMINA_DRAIN_PER_SEC)

        const partial = resolveStaminaConfig({
            ...baseConfig(),
            stamina: {max: 12, entryCost: {attack: 2}, drainPerSec: {sprinting: 0.5}},
        })
        expect(partial.max).toBe(12)
        expect(partial.entryCost.attack).toBe(2)
        expect(partial.entryCost.roll).toBe(DEFAULT_STAMINA_ENTRY_COST)
        expect(partial.drainPerSec.sprinting).toBe(0.5)
        expect(partial.drainPerSec.flying).toBe(DEFAULT_STAMINA_DRAIN_PER_SEC)
    })

    it('多件装备 / 武器修正逐项相乘', () => {
        const combined = combineStaminaModifiers([
            {entry: {attack: 1.2}, drain: {sprinting: 0.8}, regen: 1.1},
            {entry: {attack: 0.5}, drain: {flying: 0.5}, regen: 2},
        ])
        expect(combined.entry.attack).toBeCloseTo(0.6)
        expect(combined.drain.sprinting).toBeCloseTo(0.8)
        expect(combined.drain.flying).toBeCloseTo(0.5)
        expect(combined.regen).toBeCloseTo(2.2)
    })

    it('装备变更后重算有效消耗 / 恢复并保留当前体力', () => {
        const combat = createCombatComponent(createWeaponRuntime('long_sword'), 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15)
        const state = createStaminaState({
            ...baseConfig(),
            stamina: {max: 20, entryCost: {attack: 1}, drainPerSec: {sprinting: 1}, regenPerSec: 2},
        }, combat, 'humanoid')
        state.current = 10
        const config: CharacterConfig = {
            ...baseConfig(),
            stamina: {max: 30, entryCost: {attack: 2}, drainPerSec: {sprinting: 2}, regenPerSec: 3},
        }
        refreshStaminaProfile(state, config, combat, 'humanoid')
        expect(state.max).toBe(30)
        expect(state.current).toBe(10)
        expect(state.entryCost.attack).toBe(2)
        expect(state.drainPerSec.sprinting).toBe(2)
        expect(state.regenPerSec).toBe(3)
    })

    it('进入动作扣除体力并设置恢复延迟；持续状态按秒扣除后延迟恢复', () => {
        const state = createStaminaState({
            ...baseConfig(),
            stamina: {max: 20, regenDelay: 0.5, regenPerSec: 2, entryCost: {roll: 0.5}, drainPerSec: {sprinting: 1}},
        }, undefined, 'humanoid')
        expect(canAffordStaminaEntry(state, 'roll')).toBe(true)
        spendStaminaEntry(state, 'roll')
        expect(state.current).toBe(19.5)
        expect(state.regenDelayTimer).toBe(0.5)

        /* 延迟结束前不恢复 */
        updateStamina(state, 'idle', 0.5)
        expect(state.current).toBe(19.5)
        updateStamina(state, 'idle', 0.5)
        expect(state.current).toBeCloseTo(20)

        state.current = 5
        updateStamina(state, 'sprinting', 1)
        expect(state.current).toBe(4)
        expect(state.regenDelayTimer).toBe(0.5)

        state.current = 0
        expect(isStaminaExhausted(state)).toBe(true)
        expect(canAffordStaminaEntry(state, 'roll')).toBe(false)

        /* 持续状态需要恢复到上限的 10% 才能再次进入（防止按住按键反复进出） */
        state.current = state.max * 0.05
        expect(canEnterSustainedStamina(state)).toBe(false)
        state.current = state.max * 0.1
        expect(canEnterSustainedStamina(state)).toBe(true)
    })
})
