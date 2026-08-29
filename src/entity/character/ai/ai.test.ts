import {describe, it, expect, vi, afterEach} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import {RANGED_SKILL_PRESETS} from '../../../character/combat/ranged_skill.ts'
import {DEFAULT_COMBAT_CONFIGS, type CombatConfig} from '../../../character/ai_strategy/combat.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import type {CombatSubStrategy} from '../../../character/ai_strategy/types.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {AIContext, AISetInput} from './types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import {createNavRunContext, processNav} from './nav/machine.ts'
import type {NavSensor, NavSenseOutput} from './nav/types.ts'
import {createAIMachine, updateAI, notifyAIDamaged} from './machine.ts'
import {updateCombatFSM} from './combat/machine.ts'
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
        ? MELEE_SKILL_PRESETS.long_sword_light_1
        : RANGED_SKILL_PRESETS.longbow_shot
    const slot = createSkillSlot(skillPreset)
    slot.cooldownTimer = overrides?.cooldownTimer ?? 0

    return {
        id,
        body: {translation: () => ({x, y: 0, z})} as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
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
            phaseIndex: 0, phaseTimer: 0, chainEntryIndex: 0, bufferedSkillIndex: -1, pendingFlinch: false, flinchImmunityTimer: 0,
        },
        config: {speed: 0, jumpHeight: 0, scale: 1},
        mesh: null!, appearanceGroup: null!,
        isOnGround: true, rowText: '',
        groundKeepTimer: 0, airborneTime: 0, groundedTime: 0,
        isPlayer: false,
        navEnabled: true,
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
        nav: createNavRunContext(true),
        navSensor: null,
        activeFsm: 'combat',
        stallTimer: 0,
        stallAnchorX: 0,
        stallAnchorZ: 0,
        combatReentryTimer: 0,
        combatStallRetries: 0,
        combatDetourX: 0,
        combatDetourZ: 0,
        combatDetourTimer: 0,
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

    it('超出脱战阈值（侦测范围 × 滞回系数）回到 inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        /* 长剑 detRange=8，脱战阈值 16：17m 超出 */
        const enemies = [makeChar(2, 17, 0, 1, 'melee')]
        const allInactive = chaseHandler.transitions.filter(t => t.to === 'inactive')
        const guard = allInactive[allInactive.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('超出侦测范围但未达脱战阈值 → 保持战斗（距离滞回，受击仇恨目标超距时不闪退）', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        /* 12m：在 detRange(8)〜脱战阈值(16) 之间 */
        const enemies = [makeChar(2, 12, 0, 1, 'melee')]
        const allInactive = chaseHandler.transitions.filter(t => t.to === 'inactive')
        const guard = allInactive[allInactive.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('追逐超时回到 inactive', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        ctx.combatStateTime = 11
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
        const enemies = [makeChar(2, 45, 0, 1, 'ranged')]
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
        const enemies = [makeChar(2, 17, 0, 1, 'melee')]
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
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        const inputs: Array<{dx: number; dz: number; attack: boolean}> = []
        updateAI(0.016, ctx, char, [], (dx, dz, attack) => inputs.push({dx, dz, attack}))
        expect(ctx.activeFsm).toBe('peace')
    })

    it('发现敌人时切换到 combat', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        updateAI(0.016, ctx, char, enemies, () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('chase')
    })

    it('cowardly 发现敌人直接进 flee', () => {
        const char = makeChar(1, 0, 0, 0, 'melee', undefined, 'cowardly')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'cowardly')
        ctx.activeFsm = 'peace'
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        updateAI(0.016, ctx, char, enemies, () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('flee')
    })
})

describe('AI 攻击检测箱（attackDetectChecker）', () => {
    it('chase→attack：checker 判定未命中时不出招（即使在圆形距离内）', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        ctx.attackDetectChecker = () => false
        const enemies = [makeChar(2, 1.0, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(false)
    })

    it('chase→attack：checker 判定命中才进攻击（即使超出圆形距离）', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        ctx.attackDetectChecker = () => true
        const enemies = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('attack update：checker 命中才发攻击输入', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'attack'
        const enemies = [makeChar(2, 1.0, 0, 1, 'melee')]

        const captured: {dx: number; dz: number; attack: boolean}[] = []
        const capture = (dx: number, dz: number, attack: boolean): void => {
            captured.push({dx, dz, attack})
        }

        ctx.attackDetectChecker = () => true
        attackHandler.update(0.016, ctx, char, enemies, capture)
        expect(captured.pop()?.attack).toBe(true)

        ctx.attackDetectChecker = () => false
        attackHandler.update(0.016, ctx, char, enemies, capture)
        expect(captured.pop()?.attack).toBe(false)
    })

    it('attack→chase：checker 判定出箱则回追击', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'attack'
        ctx.attackDetectChecker = () => false
        /* 目标在侦测范围内但出了攻击检测箱 */
        const enemies = [makeChar(2, 1.0, 0, 1, 'melee')]
        const allChase = attackHandler.transitions.filter(t => t.to === 'chase')
        const guard = allChase[allChase.length - 1]
        expect(guard.guard(ctx, char, enemies)).toBe(true)
    })

    it('checker 缺失时回退圆形距离判定', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatState = 'chase'
        const inRange = [makeChar(2, 1.0, 0, 1, 'melee')]
        const outRange = [makeChar(2, 3, 0, 1, 'melee')]
        const guard = chaseHandler.transitions.find(t => t.to === 'attack')!
        expect(guard.guard(ctx, char, inRange)).toBe(true)
        expect(guard.guard(ctx, char, outRange)).toBe(false)
    })
})

describe('视线检测 270° 扇形门控（findNearestEnemy）', () => {
    const runDetection = (enemyX: number, enemyZ: number, facing: number): 'combat' | 'peace' => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        ctx.getFacingAngle = () => facing
        const enemies = [makeChar(2, enemyX, enemyZ, 1, 'melee')]
        updateAI(0.016, ctx, char, enemies, () => {})
        return ctx.activeFsm
    }

    it('正前方（朝向 +Z）敌人可见', () => {
        expect(runDetection(0, 3, 0)).toBe('combat')
    })

    it('侧面 90° 敌人可见（在 270° 扇形内）', () => {
        expect(runDetection(3, 0, 0)).toBe('combat')
        expect(runDetection(-3, 0, 0)).toBe('combat')
    })

    it('正后方敌人不可见（90° 盲区）', () => {
        expect(runDetection(0, -3, 0)).toBe('peace')
    })

    it('斜后方超出半角 135° 的敌人不可见', () => {
        /* 方位角 ≈ -141° > 半角 135° */
        expect(runDetection(-2, -2.5, 0)).toBe('peace')
    })

    it('扇形随朝向旋转：转身 180° 后原背后敌人变为可见', () => {
        expect(runDetection(0, -3, Math.PI)).toBe('combat')
        expect(runDetection(0, 3, Math.PI)).toBe('peace')
    })
})

describe('视线扇形扫描射线遮挡（castFan）', () => {
    /** 构造 stub 视线检查器：所有扇形射线统一填充给定遮挡距离（-1 = 无遮挡） */
    const fanLos = (hitDist: number): LineOfSightChecker => ({
        hasLOS: () => true,
        castFan: (_fx, _fy, _fz, _yaw, maxDist, out) => {
            out.fill(hitDist < 0 ? maxDist : Math.min(hitDist, maxDist))
        },
    })

    const runWithLos = (los: LineOfSightChecker, enemyX: number, enemyZ: number): 'combat' | 'peace' => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, los, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        const enemies = [makeChar(2, enemyX, enemyZ, 1, 'melee')]
        updateAI(0.016, ctx, char, enemies, () => {})
        return ctx.activeFsm
    }

    it('全部射线无遮挡 → 敌人可见', () => {
        expect(runWithLos(fanLos(-1), 0, 3)).toBe('combat')
    })

    it('射线命中点早于目标体表 → 被遮挡不可见', () => {
        /* 目标距离 3，遮挡物命中点 1.5 < 3 - 胶囊半径 0.125 - 容差 0.05 */
        expect(runWithLos(fanLos(1.5), 0, 3)).toBe('peace')
    })

    it('射线命中目标自身体表 → 仍可见（不自遮挡误判）', () => {
        /* 命中点 = 3 - 0.125（体表）≥ 3 - 0.125 - 0.05 */
        expect(runWithLos(fanLos(3 - 0.125), 0, 3)).toBe('combat')
    })

    it('遮挡物只挡住对应方位射线：其他方向敌人仍可见', () => {
        /* 左半扇形（射线 0–13）被挡在 0.5 处，右半无遮挡；
         * 正前方 +Z 敌人方位角 0° → 射线索引 round(135/10) = 14，属无遮挡区 */
        const los: LineOfSightChecker = {
            hasLOS: () => true,
            castFan: (_fx, _fy, _fz, _yaw, maxDist, out) => {
                for (let i = 0; i < out.length; i++) out[i] = i < out.length / 2 ? 0.5 : maxDist
            },
        }
        expect(runWithLos(los, 0, 3)).toBe('combat')
        /* 左侧 90° 敌人（方位角 -90° → 射线索引 round(45/10) = 5）落在被挡区 → 不可见 */
        expect(runWithLos(los, -3, 0)).toBe('peace')
    })
})

describe('静止检测与卡死自愈', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    /** 构造位置可变的角色（测试中可模拟移动/静止） */
    const makeMovableChar = (id: number, faction: number, skillType: 'melee' | 'ranged') => {
        const char = makeChar(id, 0, 0, faction, skillType)
        const pos = {x: 0, y: 0, z: 0}
        char.body = {translation: () => pos} as unknown as CharacterEntity['body']
        return {char, pos}
    }

    it('peace：有移动意图但长时间无位移 → 重掷路点', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.9)
        const {char} = makeMovableChar(1, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        ctx.waypoint = {x: 10, y: 0, z: 10}

        /* STALL_TIMEOUT = 2.0s：4 帧 × 0.5s 后触发恢复 */
        for (let i = 0; i < 4; i++) updateAI(0.5, ctx, char, [char], () => {})

        /* 路点已重掷（mock random = 0.9 → 出生点 + 0.4 × patrolRadius × 0.8 × 2 = 3.2） */
        expect(ctx.waypoint.x).toBeCloseTo(3.2)
        expect(ctx.waypoint.z).toBeCloseTo(3.2)
        expect(ctx.stallTimer).toBe(0)
    })

    it('peace：正常移动不累积静止计时', () => {
        const {char, pos} = makeMovableChar(1, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        ctx.waypoint = {x: 10, y: 0, z: 10}

        for (let i = 0; i < 6; i++) {
            pos.x += 0.3
            updateAI(0.5, ctx, char, [char], () => {})
        }

        /* 位移持续超过锚点阈值，未触发恢复，路点不变 */
        expect(ctx.waypoint.x).toBe(10)
        expect(ctx.waypoint.z).toBe(10)
    })

    it('combat：卡死先横向绕行重试，连续卡死达上限才放弃并进入接敌冷却', () => {
        const {char} = makeMovableChar(1, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        const enemy = makeChar(2, 3, 0, 1, 'melee')

        /* 第一帧发现敌人进入 combat chase */
        updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('chase')

        /* 卡死累积 2.0s → 第 1 次重试：保持战斗，输出绕行脉冲 */
        for (let i = 0; i < 4; i++) updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('chase')
        expect(ctx.combatStallRetries).toBe(1)
        expect(ctx.combatDetourTimer).toBeGreaterThan(0)

        /* 第 2 次卡死继续重试，仍不放弃 */
        for (let i = 0; i < 4; i++) updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatStallRetries).toBe(2)

        /* 第 3 次卡死达上限 → 放弃战斗 + 接敌冷却 */
        for (let i = 0; i < 4; i++) updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('peace')
        expect(ctx.combatState).toBe('inactive')
        expect(ctx.combatReentryTimer).toBeGreaterThan(0)

        /* 冷却期内敌人仍在侦测范围也不重新接敌 */
        updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('peace')
    })

    it('combat：nav stuck 逃逸期间的倒退位移不重置静止检测（重试计数持续累计，达上限后放弃战斗）', () => {
        /* 回归：坑底/墙角中 nav stuck 每 2s 输出"反向+跳跃"逃逸脉冲，倒退位移若被计入
         * "确认在动"会持续重置锚点与 combatStallRetries，导致永不放弃战斗（无限向后连跳） */
        const {char, pos} = makeMovableChar(1, 0, 'melee')
        const enemyPos = {x: 3, y: 0, z: 0}
        const enemy = makeChar(2, 3, 0, 1, 'melee')
        enemy.body = {translation: () => enemyPos} as unknown as CharacterEntity['body']
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'combat'
        ctx.combatState = 'chase'
        ctx.combatTargetId = 2
        /* 模拟 nav FSM 处于 stuck：逃逸脉冲输出期间意图方向恒为追击方向（向前） */
        ctx.nav.state = 'stuck'

        /* 首帧接敌：无位移，stallTimer 开始累计 */
        updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatStallRetries).toBe(0)

        /* 每帧向后倒退 1.2m（逃逸脉冲的向后跳跃位移），目标同步后退保持相对距离 3m：
         * nav stuck 期间该位移不计入"确认在动" → stallTimer 持续累计 */
        const step = (): void => {
            pos.x -= 1.2
            enemyPos.x -= 1.2
            updateAI(0.5, ctx, char, [char, enemy], () => {})
        }

        /* 累计 2.0s（首帧 0.5 + 3 帧 × 0.5）→ 触发第 1 次卡死恢复：横向绕行，重试计数 = 1
         * （旧逻辑会被倒退位移重置为 0，导致永不放弃战斗） */
        for (let i = 0; i < 3; i++) step()
        expect(ctx.combatStallRetries).toBe(1)
        expect(ctx.combatDetourTimer).toBeGreaterThan(0)

        /* 继续 4 帧 → 第 2 次重试 */
        for (let i = 0; i < 4; i++) step()
        expect(ctx.combatStallRetries).toBe(2)

        /* 再 4 帧 → 达上限（3 次）→ 放弃战斗 + 接敌冷却 */
        for (let i = 0; i < 4; i++) step()
        expect(ctx.activeFsm).toBe('peace')
        expect(ctx.combatState).toBe('inactive')
        expect(ctx.combatReentryTimer).toBeGreaterThan(0)
    })

    it('combat：绕行重试期间 chase 按偏转方向输出移动输入', () => {
        const {char} = makeMovableChar(1, 0, 'melee')
        const ctx = makeCtx('tactical', 2)
        ctx.combatDetourX = 0
        ctx.combatDetourZ = 1
        ctx.combatDetourTimer = 0.8
        const enemy = makeChar(2, 3, 0, 1, 'melee')
        let gotDX = 99
        let gotDZ = 99
        const setInput: AISetInput = (dx, dz) => { gotDX = dx; gotDZ = dz }

        updateCombatFSM(0.5, ctx, char, [char, enemy], setInput)

        /* 绕行阶段不朝目标（+X）而是按偏转方向（+Z）移动，并消耗计时 */
        expect(gotDX).toBe(0)
        expect(gotDZ).toBe(1)
        expect(ctx.combatDetourTimer).toBeCloseTo(0.3)
    })

    it('combat：flee 卡死仅重掷逃跑方向，不放弃战斗', () => {
        const {char} = makeMovableChar(1, 0, 'melee')
        const ctx = makeCtx('cowardly', 2)
        ctx.combatState = 'flee'
        ctx.activeFsm = 'combat'
        /* 拉长 fleeDuration，排除超时转出的干扰 */
        ctx.combatConfig = {...DEFAULT_COMBAT_CONFIGS.cowardly, fleeDuration: 100}
        ctx.combatFleeDir = {x: 1, z: 0}
        const enemy = makeChar(2, 3, 0, 1, 'melee')

        for (let i = 0; i < 5; i++) updateAI(0.5, ctx, char, [char, enemy], () => {})

        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('flee')
    })

    it('combat：面对面持续交火（有攻击意图）不被静止检测误判为卡死', () => {
        const {char} = makeMovableChar(1, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        /* 敌人距 1m：在回退检测范围 1.5 内 → chase→attack，持续输出攻击意图 */
        const enemy = makeChar(2, 1, 0, 1, 'melee')

        /* 首帧接敌 */
        updateAI(0.016, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('combat')

        /* 位移始终为零（被接触闸门阻断的峙峙态）但持续交火：
         * 远超过 STALL_TIMEOUT 2s 也不应放弃战斗 */
        for (let i = 0; i < 60; i++) updateAI(0.05, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).not.toBe('inactive')
    })

    it('combat：追击超出活动半径 → 放弃并进入接敌冷却，冷却期内不重新接敌', () => {
        const {char, pos} = makeMovableChar(1, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'aggressive')
        /* 被同速目标拖到距出生点 25m（> CHASE_LEASH_RADIUS 20），敌人仍在侦测范围 */
        pos.x = 25
        const enemy = makeChar(2, 26, 0, 1, 'melee')
        /* 预置为追击中（模拟已被拖远的既成状态） */
        ctx.activeFsm = 'combat'
        ctx.combatState = 'chase'
        ctx.combatTargetId = 2

        /* leash 生效：放弃战斗 + 冷却，且后续帧敌人再近也不接敌 */
        for (let i = 0; i < 3; i++) updateAI(0.5, ctx, char, [char, enemy], () => {})
        expect(ctx.activeFsm).toBe('peace')
        expect(ctx.combatState).toBe('inactive')
        expect(ctx.combatReentryTimer).toBeGreaterThan(0)
    })
})

describe('受击转战斗（仇恨）', () => {
    it('peace 态被敌方击中 → 强制进入 combat 并锁定攻击者', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        ctx.combatReentryTimer = 2.5
        const attacker = makeChar(2, 0, -2, 1, 'melee')

        notifyAIDamaged(ctx, char, [char, attacker], 2)

        /* 接敌冷却被清除，强制 combat 且目标锁定为攻击者（即使攻击来自背后盲区） */
        expect(ctx.combatReentryTimer).toBe(0)
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('chase')
        expect(ctx.combatTargetId).toBe(2)
    })

    it('同阵营误伤不强制开战', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        const ally = makeChar(3, 1, 0, 0, 'melee')

        notifyAIDamaged(ctx, char, [char, ally], 3)

        expect(ctx.activeFsm).toBe('peace')
        expect(ctx.combatTargetId).toBeUndefined()
    })

    it('攻击者已死亡时不锁定（冷却仍被清除）', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        ctx.combatReentryTimer = 2.5
        const dead = makeChar(2, 1, 0, 1, 'melee', {isDead: true})

        notifyAIDamaged(ctx, char, [char, dead], 2)

        expect(ctx.combatReentryTimer).toBe(0)
        expect(ctx.activeFsm).toBe('peace')
    })

    it('peace 态被侦测范围外的攻击者击中 → 进入 combat 且持续追击不闪退（距离滞回）', () => {
        const char = makeChar(1, 0, 0, 0, 'melee')
        const ctx = createAIMachine(char, 0, 0, 0, null, DEFAULT_PEACE_CONFIGS.patrol, 'tactical')
        ctx.activeFsm = 'peace'
        /* 攻击者在 12m：超出侦测半径 8（findNearestEnemy 看不见），但未达脱战阈值 16 */
        const attacker = makeChar(2, 12, 0, 1, 'ranged')

        notifyAIDamaged(ctx, char, [char, attacker], 2)
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatTargetId).toBe(2)

        /* 后续帧：敌情检查看不到攻击者，但 chase 距离滞回维持战斗，持续向目标追击 */
        for (let i = 0; i < 5; i++) updateAI(0.1, ctx, char, [char, attacker], () => {})
        expect(ctx.activeFsm).toBe('combat')
        expect(ctx.combatState).toBe('chase')
    })
})

describe('nav stuck 倒退逃逸', () => {
    /** 永远报墙且两侧无通路的传感器 */
    const blockedSensor: NavSensor = {
        sense: (): NavSenseOutput => ({
            result: 'blocked_wall',
            obstacleDistance: 1,
            obstacleHeight: 2,
            leftClear: false,
            rightClear: false,
            groundAhead: false,
        }),
    }
    const navChar = {body: {translation: () => ({x: 0, y: 0, z: 0})}} as unknown as CharacterEntity

    it('stuck 超时前保持零输出', () => {
        const ctx = createNavRunContext(true)
        ctx.state = 'stuck'
        const out = processNav(0.5, ctx, navChar, blockedSensor, 1, 0)
        expect(out).toEqual({dx: 0, dz: 0, jump: false})
    })

    it('卡住超过 stuckTimeout → 意图反向倒退 + 跳跃的逃逸脉冲', () => {
        const ctx = createNavRunContext(true)
        ctx.state = 'stuck'
        /* stuckTimeout = 2.0：前 3 帧累计 1.5s，保持静止 */
        for (let i = 0; i < 3; i++) {
            const out = processNav(0.5, ctx, navChar, blockedSensor, 1, 0)
            expect(out.jump).toBe(false)
            expect(out.dx).toBe(0)
        }
        /* 第 4 帧累计 2.0s → 触发逃逸（意图 +X → 朝 -X 倒退） */
        const out = processNav(0.5, ctx, navChar, blockedSensor, 1, 0)
        expect(out.dx).toBe(-1)
        expect(out.dz).toBeCloseTo(0)
        expect(out.jump).toBe(true)
    })
})
