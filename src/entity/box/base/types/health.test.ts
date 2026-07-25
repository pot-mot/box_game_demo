import {describe, it, expect} from 'vitest'
import {clampHealth, clampHealthOnMaxChange} from './health.ts'
import type {HealthComponent} from './health.ts'

describe('clampHealth', () => {
    it('clamps health to maxHealth when value exceeds it', () => {
        const comp: HealthComponent = {health: 50, maxHealth: 100}
        clampHealth(comp, 150)
        expect(comp.health).toBe(100)
    })

    it('clamps health to 0 when value is negative', () => {
        const comp: HealthComponent = {health: 50, maxHealth: 100}
        clampHealth(comp, -10)
        expect(comp.health).toBe(0)
    })

    it('sets health to value when within [0, maxHealth]', () => {
        const comp: HealthComponent = {health: 50, maxHealth: 100}
        clampHealth(comp, 75)
        expect(comp.health).toBe(75)
    })

    it('handles edge case of 0', () => {
        const comp: HealthComponent = {health: 50, maxHealth: 100}
        clampHealth(comp, 0)
        expect(comp.health).toBe(0)
    })
})

describe('clampHealthOnMaxChange', () => {
    it('decreases health when new max is lower than current health', () => {
        const comp: HealthComponent = {health: 80, maxHealth: 100}
        clampHealthOnMaxChange(comp, 50)
        expect(comp.maxHealth).toBe(50)
        expect(comp.health).toBe(50)
    })

    it('keeps health unchanged when new max is higher than current health', () => {
        const comp: HealthComponent = {health: 30, maxHealth: 50}
        clampHealthOnMaxChange(comp, 100)
        expect(comp.maxHealth).toBe(100)
        expect(comp.health).toBe(30)
    })

    it('keeps health unchanged when new max equals current health', () => {
        const comp: HealthComponent = {health: 50, maxHealth: 100}
        clampHealthOnMaxChange(comp, 100)
        expect(comp.maxHealth).toBe(100)
        expect(comp.health).toBe(50)
    })
})
