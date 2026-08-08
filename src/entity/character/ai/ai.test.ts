import {describe, it, expect} from 'vitest'
import {Vec3} from 'cannon-es'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import {RANGED_SKILL_PRESETS} from '../../../character/combat/ranged_skill.ts'
import {DEFAULT_COMBAT_CONFIGS, type CombatConfig} from '../../../character/ai_strategy/combat.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import type {CombatSubStrategy} from '../../../character/ai_strategy/types.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {AIContext} from './types.ts'
import {createAIMachine, updateAI} from './machine.ts'
import {chaseHandler} from './combat/states/chase.ts'
import {attackHandler} from './combat/states/attack.ts'
import {approachHandler} from './combat/states/approach.ts'
import {volleyHandler} from './combat/states/volley.ts'
import {kiteHandler} from './combat/states/kite.ts'
import {fleeHandler} from './combat/states/flee.ts'

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
    combatStrategy: CombatSubStrategy = 'tactical',
): CharacterEntity => {
    const skillPreset = skillType === 'melee'
        ? MELEE_SKILL_PRESETS.long_sword_slash
        : RANGED_SKILL_PRESETS.longbow_shot
    const slot = createSkillSlot(skillPreset)
    slot.cooldownTimer = overrides?.cooldownTimer ?? 0

    return {
        id,
        body: {position: new Vec3(x, 0, z)},
        combat: {
            faction,
            isDead: overrides?.isDead ?? false,
            attackActive: overrides?.attackActive ?? false,
            attackTendency: (a: number, b: number) => a !== b,
            tendencyConfig: {tendencyId: 'hostileExceptSelf' as const},
            skills: [slot],
            currentSkillIndex: 0,
            attackedTargets: new Set(),
            attackDirX: 0, attackDirZ: 0, swingTilt: 0,
        },
        config: {speed: 0, jumpHeight: 0, radius: 0.125, height: 1},
        mesh: null!, appearanceGroup: null!,
        isOnGround: true, rowText: '',
        groundKeepTimer: 0,
        isPlayer: false,
        peaceStrategy: 'patrol' as const,
        combatStrategy,
        isDying: false, dyingTimer: 0,
        stateMachine: null!,
    } as unknown as CharacterEntity
}

const makeCtx = (combatStrategy: CombatSubStrategy = 'tactical', targetId?: number): AIContext => {
    const combatConfig = DEFAULT_COMBAT_CONFIGS[combatStrategy] as CombatConfig
    const ctx: AIContext = {
        characterId: 0,
        spawnPoint: {x: 0, y: 0, z: 0},
        losChecker: null,
        activeFsm: 'combat',
        combatState: 'chase',
        combatStateTime: 0,
        combatTargetId: targetId,
        combatStrafeDir: 0,
        combatStrafeTimer: 0,
        combatFleeDir: {x: 0, z: 0},
        combatBurstAttackCount: 0,
        combatStrategy,
        combatConfig,
        peaceState: 'patrol',
        peaceStateTime: 0,
        peaceConfig: DEFAULT_PEACE_CONFIGS.patrol,
        waypoint: {x: 0, y: 0, z: 0},
        waitTimer: 0,
        buildTimer: 0,
    }
    return ctx
}

// ── 战斗 FSM 单元测试 ──

describe('AI 状态转换 — chase (近战)', () => {
    it('进入攻击状态', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        const enemies = [makeChar(2, 1.0, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('距离不够时不能进入攻击状态', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('远程角色不能进入攻击状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('超出侦测范围回到 inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        const allInactive = chaseHandler.transitions.filter(t => t.to === 'inactive')
        const guard = allInactive[allInactive.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('追逐超时回到 inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        ctx.combatStateTime = 6
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'inactive')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — chase (aggressive)', () => {
    it('aggressive 远程在攻击距离内进入攻击', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0}, 'aggressive')
        const ctx = makeCtx('aggressive', 2)
        ctx.combatState = 'chase'
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — chase (远程)', () => {
    it('进入逼近状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0})
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')]
        const guard = chaseHandler.transitions.find(t => t.to === 'approach')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — approach', () => {
    it('进入扫射状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0})
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'approach'
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'volley')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('目标拉远回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'approach'
        const enemies = [makeChar(2, 12, 0, 1, 'ranged')]
        const allChase = approachHandler.transitions.filter(t => t.to === 'chase')
        const guard = allChase[allChase.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('超出侦测范围回到 inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'approach'
        const enemies = [makeChar(2, 25, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'inactive')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('逼近超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'approach'
        ctx.combatStateTime = 5
        const enemies = [makeChar(2, 5, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — approach (aggressive)', () => {
    it('aggressive 进入攻击而非扫射', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged', {cooldownTimer: 0}, 'aggressive')
        const ctx = makeCtx('aggressive', 2)
        ctx.combatState = 'approach'
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')]
        const guard = approachHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — volley', () => {
    it('进入后撤状态', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'volley'
        const enemies = [makeChar(2, 2, 0, 1, 'ranged')]
        const guard = volleyHandler.transitions.find(t => t.to === 'kite')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('目标拉远回到逼近', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'volley'
        const enemies = [makeChar(2, 12, 0, 1, 'ranged')]
        const guard = volleyHandler.transitions.find(t => t.to === 'approach')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('扫射超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'volley'
        ctx.combatStateTime = 9
        const enemies = [makeChar(2, 6, 0, 1, 'ranged')]
        const guard = volleyHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — kite', () => {
    it('退回安全距离回到扫射', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'kite'
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')]
        const guard = kiteHandler.transitions.find(t => t.to === 'volley')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('后退超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'ranged')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'kite'
        ctx.combatStateTime = 4
        const enemies = [makeChar(2, 8, 0, 1, 'ranged')]
        const guard = kiteHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — attack (近战)', () => {
    it('超出攻击距离回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'attack'
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const allChase = attackHandler.transitions.filter(t => t.to === 'chase')
        const guard = allChase[allChase.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('超出侦测范围回到 inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'attack'
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        const guard = attackHandler.transitions.find(t => t.to === 'inactive')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('攻击超时回到追逐', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'attack'
        ctx.combatStateTime = 4
        const enemies = [makeChar(2, 1, 0, 1, 'melee')]
        const guard = attackHandler.transitions.find(t => t.to === 'chase')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — attack (cowardly)', () => {
    it('cowardly 攻击后逃跑', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx('cowardly', 2)
        ctx.combatState = 'attack'
        ctx.combatStateTime = 2
        const enemies = [makeChar(2, 1, 0, 1, 'melee')]
        const guard = attackHandler.transitions.find(t => t.to === 'flee')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })
})

describe('AI 状态转换 — flee', () => {
    it('逃跑超时且有目标 → 进入攻击', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx('cowardly', undefined)
        ctx.combatState = 'flee'
        ctx.combatStateTime = 3
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = fleeHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
        expect(ctx.combatTargetId).toBe(2)
        expect(ctx.combatBurstAttackCount).toBe(1)
    })

    it('逃跑超时且无目标 → inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx('cowardly', undefined)
        ctx.combatState = 'flee'
        ctx.combatStateTime = 3
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        const guard = fleeHandler.transitions.find(t => t.to === 'inactive')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('没有敌人在侦测范围内 → inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = makeCtx('cowardly', undefined)
        ctx.combatState = 'flee'
        ctx.combatStateTime = 1
        const allInactive = fleeHandler.transitions.filter(t => t.to === 'inactive')
        const guard = allInactive[allInactive.length - 1]
        expect(guard.guard(ctx, char, [])).toBe(true)
    })
})

describe('AI 顶层调度器', () => {
    it('无敌人时运行和平 FSM', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, 8, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        const inputs: Array<{dx: number; dz: number; attack: boolean}> = []
        updateAI(0.016, ctx, char, [], (dx, dz, attack) => inputs.push({dx, dz, attack}))
        expect(ctx.activeFsm).toBe('peace')
    })

    it('发现敌人时切换到 combat', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, 8, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        updateAI(0.016, ctx, char, enemies, () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('chase')
    })

    it('cowardly 发现敌人直接进 flee', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = createAIMachine(char, 0, 0, 0, 8, null, DEFAULT_PEACE_CONFIGS.patrol, 'cowardly')
        ctx.activeFsm = 'peace'
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        updateAI(0.016, ctx, char, enemies, () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('flee')
    })
})
