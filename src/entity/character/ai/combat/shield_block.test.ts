import {describe, it, expect} from 'vitest'
import {shouldReactiveBlock} from './shield_block.ts'
import type {AIContext} from '../types.ts'
import type {CharacterEntity} from '../../../../character/types.ts'
import type {ShieldBlockConfig} from '../../../../character/weapon/constants.ts'

const BLOCK = {} as ShieldBlockConfig

const ctx = (targetId?: number): AIContext => ({combatTargetId: targetId} as unknown as AIContext)

const char = (partial: {block?: boolean; guard?: number; z?: number}): CharacterEntity => ({
    combat: {block: partial.block === false ? undefined : BLOCK, guard: partial.guard ?? 10, isDead: false},
    body: {translation: () => ({x: 0, y: 0, z: partial.z ?? 0})},
} as unknown as CharacterEntity)

const target = (partial: {z?: number; attackActive?: boolean; attackDirX?: number; attackDirZ?: number}): CharacterEntity => ({
    id: 2,
    combat: {
        isDead: false,
        attackActive: partial.attackActive ?? true,
        attackDirX: partial.attackDirX ?? 0,
        attackDirZ: partial.attackDirZ ?? -1,
    },
    body: {translation: () => ({x: 0, y: 0, z: partial.z ?? 2})},
} as unknown as CharacterEntity)

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
})
