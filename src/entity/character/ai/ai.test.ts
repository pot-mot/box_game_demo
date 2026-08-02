import {describe, it, expect} from 'vitest'
import {Vec3} from 'cannon-es'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import {RANGED_SKILL_PRESETS} from '../../../character/combat/ranged_skill.ts'
import type {AIStrategy} from '../../../character/ai_strategy.ts'
import {DEFAULT_STRATEGY_CONFIGS} from '../../../character/ai_strategy.ts'
import type {AIContext} from './types.ts'
import {patrolHandler} from './states/patrol.ts'
import {chaseHandler} from './states/chase.ts'
import {attackHandler} from './states/attack.ts'
import {approachHandler} from './states/approach.ts'
import {volleyHandler} from './states/volley.ts'
import {kiteHandler} from './states/kite.ts'
import {fleeHandler} from './states/flee.ts'

/** 构造最低限度 CharacterEntity */
const makeChar = (
    id: number,
    x: number, z: number,
    faction: number,
    skillType: 'melee' | 'ranged',
    overrides?: {
        cooldownTimer?: number
        isDead?: boolean
        attackActive?: boolean
    },
    aiStrategy: AIStrategy = 'tactical',
): Parameters<typeof patrolHandler.transitions[0]['guard']>[1] => {
    const skillPreset = skillType === 'melee'
        ? MELEE_SKILL_PRESETS.long_sword_slash
        : RANGED_SKILL_PRESETS.longbow_shot
    const slot = createSkillSlot(skillPreset)
    slot.cooldownTimer = overrides?.cooldownTimer ?? 0

    return {
        id,
        body: {position: new Vec3(x, 0, z)} as Parameters<typeof patrolHandler.transitions[0]['guard']>[1]['body'],
        combat: {
            faction,
            isDead: overrides?.isDead ?? false,
            attackActive: overrides?.attackActive ?? false,
            attackTendency: (a: number, b: number) => a !== b,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            skills: [slot],
            currentSkillIndex: 0,
            attackedTargets: new Set(),
            attackDirX: 0, attackDirZ: 0, swingTilt: 0,
        } as Parameters<typeof patrolHandler.transitions[0]['guard']>[1]['combat'],
        config: {speed: 0, jumpHeight: 0, radius: 0.125, height: 1},
        mesh: null!, appearanceGroup: null!,
        isOnGround: true, rowText: '',
        isPlayer: false, aiStrategy,
        isDying: false, dyingTimer: 0,
        stateMachine: null!,
    }
}

const makeCtx = (targetId?: number, strategy: AIStrategy = 'tactical'): AIContext => ({
    characterId: 0,
    spawnPoint: {x: 0, y: 0, z: 0},
    patrolRadius: 5,
    waypoint: {x: 0, y: 0, z: 0},
    currentState: 'patrol',
    stateTime: 0,
    waitTimer: 0,
    targetId,
    strafeDir: 0,
    strafeTimer: 0,
    losChecker: null,
    strategy,
    strategyConfig: DEFAULT_STRATEGY_CONFIGS[strategy],
    fleeDir: {x: 0, z: 0},
    burstAttackCount: 0,
})

describe('AI 状态转换 — patrol', () => {
    const guard = patrolHandler.transitions.find(t => t.to === 'chase')!

    it('发现最近敌人', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx()
        const enemies = [
            makeChar(2, 5, 0, 1, 'melee'),
            makeChar(3, 3, 0, 2, 'melee'),
            makeChar(4, 8, 0, 3, 'melee'),
        ]
        const result = guard.guard(ctx, char, enemies)
        expect(result).toBe(true)
        expect(ctx.targetId).toBe(3)
    })

    it('超出侦测范围的敌人不可被选中', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx()
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('跳过已死亡的敌人', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx()
        const enemies = [
            makeChar(2, 3, 0, 1, 'melee', {isDead: true}),
            makeChar(3, 5, 0, 2, 'melee'),
        ]
        const result = guard.guard(ctx, char, enemies)
        expect(result).toBe(true)
        expect(ctx.targetId).toBe(3)
    })

    it('没有敌人时返回 false', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx()
        expect(guard.guard(ctx, char, [])).toBe(false)
    })

    it('不攻击同阵营', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx()
        const enemies = [makeChar(2, 3, 0, 0, 'melee')]
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })
})

describe('AI 状态转换 — patrol (cowardly)', () => {
    it('cowardly 发现敌人直接进入 flee', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx(undefined, 'cowardly')
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = patrolHandler.transitions.find(t => t.to === 'flee')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — chase (近战)', () => {
    it('进入攻击状态', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 1.0, 0, 1, 'melee')] // 1.0 < range=1.5
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('距离不够时不能进入攻击状态', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('远程角色不能进入攻击状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('超出侦测范围回到巡逻', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        /* 取最后一个 patrol 守卫（距离检测）而非超时守卫 */
        const allPatrol = chaseHandler.transitions.filter(t => t.to === 'patrol')
        const guard = allPatrol[allPatrol.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('追逐超时回到巡逻', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        ctx.stateTime = 6
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'patrol')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — chase (aggressive)', () => {
    it('aggressive 远程在攻击距离内进入攻击', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0}, 'aggressive')
        const ctx = makeCtx(2, 'aggressive')
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        /* longbow range=10, idealRange=7, 5 < 10 所以应能进入攻击 */
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — chase (远程)', () => {
    it('进入逼近状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0})
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')] // 8 < idealRange*1.3=9.1
        const guard = chaseHandler.transitions.find(t => t.to === 'approach')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — approach', () => {
    it('进入扫射状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0})
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')] // 5 < idealRange+0.5=7.5
        const guard = approachHandler.transitions.find(t => t.to === 'volley')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('目标拉远回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 12, 0, 1, 'ranged')] // 12 > idealRange*1.5=10.5
        /* 取最后一个 chase 守卫（距离检测）而非超时守卫 */
        const allChase = approachHandler.transitions.filter(t => t.to === 'chase')
        const guard = allChase[allChase.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('超出侦测范围回到巡逻', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 25, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'patrol')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('逼近超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        ctx.stateTime = 5
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — approach (aggressive)', () => {
    it('aggressive 进入攻击而非扫射', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0}, 'aggressive')
        const ctx = makeCtx(2, 'aggressive')
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — volley', () => {
    it('进入后撤状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 2, 0, 1, 'ranged')] // 2 < retreatRange=4
        const guard = volleyHandler.transitions.find(t => t.to === 'kite')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('目标拉远回到逼近', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 12, 0, 1, 'ranged')] // 12 > idealRange*1.3=9.1
        const guard = volleyHandler.transitions.find(t => t.to === 'approach')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('扫射超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        ctx.stateTime = 9
        const enemies = [makeChar(2, 6, 0, 1, 'ranged')]
        const guard = volleyHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — kite', () => {
    it('退回安全距离回到扫射', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')] // 8 > retreatRange*1.5=6
        const guard = kiteHandler.transitions.find(t => t.to === 'volley')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('后退超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx(2)
        ctx.stateTime = 4
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')]
        const guard = kiteHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — attack (近战)', () => {
    it('超出攻击距离回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 3, 0, 1, 'melee')] // 3 > range=1.5 且 3 < detection=8
        /* 取最后一个 chase 守卫（距离检测）而非超时守卫 */
        const allChase = attackHandler.transitions.filter(t => t.to === 'chase')
        const guard = allChase[allChase.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('超出侦测范围回到巡逻', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        const guard = attackHandler.transitions.find(t => t.to === 'patrol')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('攻击超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx(2)
        ctx.stateTime = 4
        const enemies = [makeChar(2, 1, 0, 1, 'melee')]
        const guard = attackHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — attack (cowardly)', () => {
    it('cowardly 攻击后逃跑', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx(2, 'cowardly')
        ctx.stateTime = 2
        const enemies = [makeChar(2, 1, 0, 1, 'melee')]
        const guard = attackHandler.transitions.find(t => t.to === 'flee')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — flee', () => {
    it('逃跑超时且有目标 → 进入攻击', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx(undefined, 'cowardly')
        ctx.stateTime = 3
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = fleeHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
        expect(ctx.targetId).toBe(2)
        expect(ctx.burstAttackCount).toBe(1)
    })

    it('逃跑超时且无目标 → 巡逻', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx(undefined, 'cowardly')
        ctx.stateTime = 3
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        const guard = fleeHandler.transitions.find(t => t.to === 'patrol')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('没有敌人在侦测范围内 → 巡逻', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx(undefined, 'cowardly')
        ctx.stateTime = 1
        /* 取最后一个 patrol 守卫（空范围检测）而非 first 的 burst-count guard */
        const allPatrol = fleeHandler.transitions.filter(t => t.to === 'patrol')
        const guard = allPatrol[allPatrol.length - 1]
        expect(guard.guard(ctx, char, [])).toBe(true)
    })
})
