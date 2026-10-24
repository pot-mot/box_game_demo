import {describe, it, expect} from 'vitest'
import {shouldReactiveBlock} from './shield_block.ts'
import type {AIContext} from '../types.ts'
import type {CharacterEntity} from '../../../../character/types.ts'
import type {ShieldBlockConfig} from '../../../../character/weapon/constants.ts'
import type {CombatComponent} from '../../../../character/combat/types.ts'
import {createTestCharacterState} from '../../../../character/state/test_state.ts'

const BLOCK = {} as ShieldBlockConfig

const ctx = (targetId?: number): AIContext => ({combatTargetId: targetId} as unknown as AIContext)

const char = (partial: {block?: boolean; guard?: number; z?: number; aiBlockDuration?: number}): CharacterEntity => {
    const state = createTestCharacterState({
        id: 1,
        combat: {
            block: partial.block === false ? undefined : BLOCK,
            guard: partial.guard ?? 10,
            isDead: false,
        } as unknown as CombatComponent,
    })
    state.ai.aiBlockDuration = partial.aiBlockDuration ?? 0.4
    return {
        state,
        body: {translation: () => ({x: 0, y: 0, z: partial.z ?? 0})} as unknown as CharacterEntity['body'],
        mesh: null!, wireframe: undefined, appearanceGroup: null!,
        mainCollider: undefined!, colliders: [],
        stateMachine: null!,
    }
}

const target = (partial: {z?: number; attackActive?: boolean; attackDirX?: number; attackDirZ?: number}): CharacterEntity => {
    const state = createTestCharacterState({
        id: 2,
        combat: {
            isDead: false,
            attackActive: partial.attackActive ?? true,
            attackDirX: partial.attackDirX ?? 0,
            attackDirZ: partial.attackDirZ ?? -1,
        } as unknown as CombatComponent,
    })
    return {
        state,
        body: {translation: () => ({x: 0, y: 0, z: partial.z ?? 2})} as unknown as CharacterEntity['body'],
        mesh: null!, wireframe: undefined, appearanceGroup: null!,
        mainCollider: undefined!, colliders: [],
        stateMachine: null!,
    }
}

describe('AI 反应式盾格挡', () => {
    it('目标在范围内起手且朝向我方 → 举盾', () => {
        expect(shouldReactiveBlock(ctx(2), char({}), [target({})])).toBe(true)
    })

    it('目标背向我方（攻击方向点积低于阈值）→ 不举盾', () => {
        expect(shouldReactiveBlock(ctx(2), char({}), [target({attackDirZ: 1})])).toBe(false)
    })

    it('目标超出威胁范围 → 不举盾', () => {
        expect(shouldReactiveBlock(ctx(2), char({}), [target({z: 10})])).toBe(false)
    })

    it('目标未在攻击 → 不举盾', () => {
        expect(shouldReactiveBlock(ctx(2), char({}), [target({attackActive: false})])).toBe(false)
    })

    it('自身无盾 / 已破防 → 不举盾', () => {
        expect(shouldReactiveBlock(ctx(2), char({block: false}), [target({})])).toBe(false)
        expect(shouldReactiveBlock(ctx(2), char({guard: 0}), [target({})])).toBe(false)
    })

    it('无战斗目标 → 不举盾', () => {
        expect(shouldReactiveBlock(ctx(undefined), char({}), [target({})])).toBe(false)
    })

    it('首次威胁成立时开启举盾窗口', () => {
        const fresh = {...ctx(2), combatBlockTimer: 0, combatBlockCooldownTimer: 0} as AIContext
        expect(shouldReactiveBlock(fresh, char({}), [target({})])).toBe(true)
        expect(fresh.combatBlockTimer).toBeGreaterThan(0)
    })

    it('举盾窗口内持续举盾（即使威胁消失），冷却期有威胁也不举盾', () => {
        const inWindow = {...ctx(2), combatBlockTimer: 0.2, combatBlockCooldownTimer: 0} as AIContext
        expect(shouldReactiveBlock(inWindow, char({}), [target({attackActive: false})])).toBe(true)

        const cooling = {...ctx(2), combatBlockTimer: 0, combatBlockCooldownTimer: 1.0} as AIContext
        expect(shouldReactiveBlock(cooling, char({}), [target({})])).toBe(false)
    })
})
