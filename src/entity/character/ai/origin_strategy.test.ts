import {describe, it, expect} from 'vitest'
import {createAIMachine} from './machine.ts'
import {updateOrigin, notifyAIKill, setOriginFromCharacter, setOriginFromPosition} from './origin.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import {HUMANOID_BODY_FORM} from '../body_form/index.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {createTestCharacterState} from '../../../character/state/test_state.ts'

/** 脚底中心偏移（scale=1 → 0.5）：由物理中心反算脚底原点用 */
const HALF_H = HUMANOID_BODY_FORM.base.centerOffsetY

/** 最小角色替身：仅提供原点逻辑读取的字段（body.translation / config.scale / originInterval） */
const makeChar = (x: number, z: number, y = 0): {char: CharacterEntity; pos: {x: number; y: number; z: number}} => {
    const pos = {x, y, z}
    const state = createTestCharacterState({
        id: 1,
        config: {speed: 0, jumpHeight: 0, scale: 1},
    })
    state.ai.originStrategy = 'resident'
    state.ai.originInterval = 20
    const char = {
        state,
        body: {translation: () => pos},
        mesh: null!, wireframe: undefined, appearanceGroup: null!,
        mainCollider: undefined!, colliders: [],
        stateMachine: null!,
    } as unknown as CharacterEntity
    return {char, pos}
}

const makeCtx = (
    char: CharacterEntity,
    spawnX: number, spawnZ: number,
    originStrategy: 'resident' | 'fighter' | 'hunter' | 'roamer',
    originInterval = 0,
) => createAIMachine(
    char, spawnX, 0, spawnZ, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical',
    undefined, undefined, originStrategy, originInterval,
)

describe('行为原点策略 — 原点写入辅助', () => {
    it('setOriginFromCharacter 取身体中心回退半高后的脚底原点', () => {
        const {char} = makeChar(3, 4, 2)
        const ctx = makeCtx(char, 0, 0, 'resident')
        setOriginFromCharacter(ctx, char)
        expect(ctx.origin).toEqual({x: 3, y: 2 - HALF_H, z: 4})
    })

    it('setOriginFromPosition 原样写入世界坐标（狩猎者用被击杀者位置）', () => {
        const {char} = makeChar(0, 0)
        const ctx = makeCtx(char, 0, 0, 'resident')
        setOriginFromPosition(ctx, 9, 1, -7)
        expect(ctx.origin).toEqual({x: 9, y: 1, z: -7})
    })
})

describe('行为原点策略 — 居民', () => {
    it('updateOrigin 不改变原点（恒为初始锚点）', () => {
        const {char, pos} = makeChar(3, 4)
        const ctx = makeCtx(char, 3, 4, 'resident')
        pos.x = 100
        pos.z = 100
        updateOrigin(1000, ctx, char)
        expect(ctx.origin).toEqual({x: 3, y: 0, z: 4})
    })

    it('notifyAIKill 不改变原点', () => {
        const {char} = makeChar(3, 4)
        const ctx = makeCtx(char, 3, 4, 'resident')
        notifyAIKill(ctx, char, {x: 99, y: 0, z: 99})
        expect(ctx.origin).toEqual({x: 3, y: 0, z: 4})
    })
})

describe('行为原点策略 — 漫游者', () => {
    it('计时未到不更新；到期且处于和平 → 原点更新为当前位置并重置计时', () => {
        const {char, pos} = makeChar(0, 0)
        const ctx = makeCtx(char, 0, 0, 'roamer', 20)
        expect(ctx.originTimer).toBe(20)

        pos.x = 5
        pos.y = 2
        pos.z = 7
        /* 未到期：仅倒数，原点不动 */
        updateOrigin(10, ctx, char)
        expect(ctx.originTimer).toBeCloseTo(10)
        expect(ctx.origin).toEqual({x: 0, y: 0, z: 0})

        /* 到期且和平：以当前位置（脚底）为原点，计时重置为 interval */
        updateOrigin(10, ctx, char)
        expect(ctx.origin).toEqual({x: 5, y: 2 - HALF_H, z: 7})
        expect(ctx.originTimer).toBe(20)
    })

    it('战斗期计时持续倒数但原点冻结；脱战后首个和平帧立即更新', () => {
        const {char, pos} = makeChar(0, 0)
        char.state.ai.originInterval = 5
        const ctx = makeCtx(char, 0, 0, 'roamer', 5)
        ctx.activeFsm = 'combat'

        pos.x = 8
        pos.y = 0
        pos.z = 0
        updateOrigin(5, ctx, char)
        expect(ctx.origin).toEqual({x: 0, y: 0, z: 0})
        /* 战斗期内超时后再推进也不写原点 */
        updateOrigin(1, ctx, char)
        expect(ctx.origin).toEqual({x: 0, y: 0, z: 0})

        ctx.activeFsm = 'peace'
        updateOrigin(0.1, ctx, char)
        expect(ctx.origin).toEqual({x: 8, y: -HALF_H, z: 0})
        expect(ctx.originTimer).toBe(5)
    })

    it('notifyAIKill 不改变漫游者原点（仅脱战结算）', () => {
        const {char} = makeChar(0, 0)
        const ctx = makeCtx(char, 0, 0, 'roamer', 20)
        notifyAIKill(ctx, char, {x: 99, y: 0, z: 99})
        expect(ctx.origin).toEqual({x: 0, y: 0, z: 0})
    })
})

describe('行为原点策略 — 战斗者 / 狩猎者（击杀钩子）', () => {
    it('战斗者：击杀后原点 = 击杀者脚底位置', () => {
        const {char} = makeChar(2, 3, 1)
        const ctx = makeCtx(char, 0, 0, 'fighter')
        notifyAIKill(ctx, char, {x: 99, y: 0, z: 99})
        expect(ctx.origin).toEqual({x: 2, y: 1 - HALF_H, z: 3})
    })

    it('狩猎者：击杀后原点 = 被击杀者位置', () => {
        const {char} = makeChar(2, 3, 1)
        const ctx = makeCtx(char, 0, 0, 'hunter')
        notifyAIKill(ctx, char, {x: 99, y: 4, z: -9})
        expect(ctx.origin).toEqual({x: 99, y: 4, z: -9})
    })
})
