import {describe, it, expect} from 'vitest'
import type {CombatComponent} from './types.ts'
import type {ComboGuardContext, SkillSlot} from './skill_types.ts'
import {buildTestWeaponSkillSlots, TEST_WEAPON_CHARGE_HOLD, TEST_WEAPON_SKILL_CONFIGS} from './test_weapon.ts'
import {createDashSkillSlot} from './dash_skill.ts'
import {
    evalComboGuard, resolveEntrySkillIndex, resolveChainNextIndex, chainGroupOf,
    holdAtLeast, holdLessThan, hasMoveInput, noMoveInput,
} from './combo_guard.ts'

/** 构造守卫上下文快照（默认：无方向、未蓄力） */
const ctx = (over: Partial<ComboGuardContext> = {}): ComboGuardContext =>
    ({dx: 0, dz: 0, holdDuration: 0, ...over})

/** 构造仅含守卫解析所需字段的最小战斗组件（字段全集满足 CombatComponent 类型） */
const makeCombat = (skills: SkillSlot[], currentSkillIndex = 0, chainEntryIndex = 0): CombatComponent => ({
    skills, dashSkill: createDashSkillSlot(), currentSkillIndex,
    attackActive: false, attackTimer: 0,
    attackedTargets: new Set(), attackDirX: 0, attackDirZ: 0, swingTilt: 0,
    phaseIndex: 0, phaseTimer: 0, chainEntryIndex, bufferedSkillIndex: -1,
    pendingFlinch: false, flinchImmunityTimer: 0,
    faction: 0, attackTendency: () => true, tendencyConfig: {tendencyId: 'hostileExceptSelf'},
    health: 100, maxHealth: 100, isDead: false,
    damageModifiers: [],
    onDamageTaken: null, onDamageDealt: null, onDeath: null,
})

describe('常用守卫', () => {
    it('holdAtLeast 边界：等于阈值通过，略低不通过', () => {
        const g = holdAtLeast(0.5)
        expect(g(ctx({holdDuration: 0.49}))).toBe(false)
        expect(g(ctx({holdDuration: 0.5}))).toBe(true)
        expect(g(ctx({holdDuration: 0.6}))).toBe(true)
    })

    it('holdLessThan 边界：等于阈值不通过', () => {
        const g = holdLessThan(0.5)
        expect(g(ctx({holdDuration: 0.49}))).toBe(true)
        expect(g(ctx({holdDuration: 0.5}))).toBe(false)
    })

    it('hasMoveInput / noMoveInput 方向判定互斥', () => {
        expect(hasMoveInput(ctx())).toBe(false)
        expect(noMoveInput(ctx())).toBe(true)
        expect(hasMoveInput(ctx({dx: 0.5}))).toBe(true)
        expect(noMoveInput(ctx({dz: -0.5}))).toBe(false)
        /* 微小噪声方向视为无输入 */
        expect(hasMoveInput(ctx({dx: 0.0005}))).toBe(false)
    })

    it('evalComboGuard：无守卫 = 无条件通过', () => {
        expect(evalComboGuard(undefined, ctx())).toBe(true)
        expect(evalComboGuard(holdAtLeast(1), ctx())).toBe(false)
    })
})

describe('test_weapon 槽结构', () => {
    it('6 槽：轻键组守卫变体 + 兜底、重键组独立链', () => {
        const slots = buildTestWeaponSkillSlots()
        expect(slots).toHaveLength(6)
        /* charge：轻键组守卫变体（声明在兜底 tap 之前 → 条件优先） */
        expect(slots[0].isChainEntry).toBe(true)
        expect(slots[0].entryGroup).toBe(0)
        expect(slots[0].triggerGuard).toBeDefined()
        expect(slots[0].comboChain).toBeUndefined()
        /* tap：轻键组兜底（无守卫），带方向变体链 */
        expect(slots[1].isChainEntry).toBe(true)
        expect(slots[1].entryGroup).toBe(0)
        expect(slots[1].triggerGuard).toBeUndefined()
        expect(slots[1].comboChain).toEqual(['test_weapon_thrust', 'test_weapon_light_2'])
        /* heavy_1：索引 2 但 entryGroup = 1 → 重击键命中 */
        expect(slots[2].isChainEntry).toBe(true)
        expect(slots[2].entryGroup).toBe(1)
        /* thrust：链中段方向守卫 */
        expect(slots[3].isChainEntry).toBeFalsy()
        expect(slots[3].triggerGuard).toBeDefined()
    })
})

describe('起手解析 resolveEntrySkillIndex', () => {
    it('轻击键点按（hold=0）→ 兜底 tap', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        expect(resolveEntrySkillIndex(c, 0, ctx())).toBe(1)
    })

    it('轻击键长按 >= 阈值 → 守卫变体 charge 优先', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        expect(resolveEntrySkillIndex(c, 0, ctx({holdDuration: TEST_WEAPON_CHARGE_HOLD}))).toBe(0)
    })

    it('长按略低于阈值 → 仍走点按兜底', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        expect(resolveEntrySkillIndex(c, 0, ctx({holdDuration: TEST_WEAPON_CHARGE_HOLD - 0.01}))).toBe(1)
    })

    it('重击键 → entryGroup 映射命中 heavy_1（索引 2）', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        expect(resolveEntrySkillIndex(c, 1, ctx())).toBe(2)
        /* 重击长按不改变结果（重键组无蓄力变体） */
        expect(resolveEntrySkillIndex(c, 1, ctx({holdDuration: 2}))).toBe(2)
    })

    it('守卫变体冷却中 → 回退兜底槽（冷却相互独立）', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        c.skills[0].cooldownTimer = 1
        expect(resolveEntrySkillIndex(c, 0, ctx({holdDuration: TEST_WEAPON_CHARGE_HOLD}))).toBe(1)
    })

    it('键组内全部起手槽冷却中 → -1', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        c.skills[0].cooldownTimer = 1
        c.skills[1].cooldownTimer = 1
        expect(resolveEntrySkillIndex(c, 0, ctx())).toBe(-1)
    })

    it('不存在的键组 → -1', () => {
        const c = makeCombat(buildTestWeaponSkillSlots())
        expect(resolveEntrySkillIndex(c, 2, ctx())).toBe(-1)
    })

    it('非起手槽兜底：远程单槽技能按冷却 + 守卫直接释放', () => {
        const c = makeCombat([{config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_tap, cooldownTimer: 0}])
        expect(resolveEntrySkillIndex(c, 0, ctx())).toBe(0)
        c.skills[0].cooldownTimer = 0.5
        expect(resolveEntrySkillIndex(c, 0, ctx())).toBe(-1)
    })
})

describe('链下一段解析 resolveChainNextIndex', () => {
    it('tap 链：有移动输入 → 方向变体 thrust', () => {
        const c = makeCombat(buildTestWeaponSkillSlots(), 1)
        expect(resolveChainNextIndex(c, ctx({dx: 1}))).toBe(3)
    })

    it('tap 链：无移动输入 → 兜底 light_2', () => {
        const c = makeCombat(buildTestWeaponSkillSlots(), 1)
        expect(resolveChainNextIndex(c, ctx())).toBe(4)
    })

    it('charge 无 comboChain → -1', () => {
        const c = makeCombat(buildTestWeaponSkillSlots(), 0)
        expect(resolveChainNextIndex(c, ctx({dx: 1}))).toBe(-1)
    })

    it('heavy 链：heavy_1 → heavy_2（无守卫直接命中）', () => {
        const c = makeCombat(buildTestWeaponSkillSlots(), 2)
        expect(resolveChainNextIndex(c, ctx())).toBe(5)
    })
})

describe('chainGroupOf', () => {
    it('起手槽带 entryGroup → 取组号', () => {
        const c = makeCombat(buildTestWeaponSkillSlots(), 2, 2)
        expect(chainGroupOf(c)).toBe(1)
    })

    it('起手槽为轻键组兜底 tap → 组 0', () => {
        const c = makeCombat(buildTestWeaponSkillSlots(), 1, 1)
        expect(chainGroupOf(c)).toBe(0)
    })
})
