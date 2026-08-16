import type {MeleeWeaponConfig} from '../weapon/melee_weapon.ts'
import {DEFAULT_ANIM, type AttackPhase} from './attack_phases.ts'
import type {MeleeSkillConfig} from './melee_skill.ts'
import type {SkillSlot} from './skill_types.ts'
import {hasMoveInput, holdAtLeast} from './combo_guard.ts'

/**
 * 测试武器（test_weapon）— 仅供单元测试 / 连段机制验证，不进生产武器列表（MELEE_WEAPON_PRESETS）。
 * 覆盖的连段情况：
 * - 蓄力起手：轻击键长按 >= TEST_WEAPON_CHARGE_HOLD 松开触发 charge（守卫 holdAtLeast）
 * - 点按兜底起手：同键组无守卫兜底槽 tap（守卫变体 charge 声明在其之前 → 条件优先）
 * - 键组分离：重击键组（entryGroup 1）独立 heavy 链
 * - 方向组合键：链下一段候选 [thrust(守卫 hasMoveInput), light_2(兜底)]
 * - 循环链：tap ↔ light_2、heavy_1 ↔ heavy_2；thrust 播完回 tap
 * - 无链单发：charge 不带 comboChain
 */

export const TEST_WEAPON_ID = 'test_weapon'

/** 蓄力阈值（秒）：攻击键按住时长 >= 该值时松开触发蓄力段 */
export const TEST_WEAPON_CHARGE_HOLD = 0.5

export const TEST_WEAPON: MeleeWeaponConfig = {
    id: TEST_WEAPON_ID, type: 'melee',
    damage: 3,
    knockbackForce: 4, knockbackY: 2,
    detectionRange: 8,
    detectBox: {size: {x: 0.45, y: 1.1, z: 1.3}, offset: {x: 0, y: 0, z: 0.45}},
    mesh: {id: 'sword', bladeLen: 0.45, color: 0x55cc88, gripColor: 0x334433},
}

/** 段阶段序列：strike 动作段（ratio = 1，时长取 config.duration）+ recovery 恢复段（时长取 config.recovery） */
const segmentPhases = (): readonly AttackPhase[] => [
    {name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingForwardX: 1.8, elbowBend: 0.2, bodyLean: 0.08}},
    {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.35, cancellable: false, animConfig: {...DEFAULT_ANIM, elbowBend: 0.2, bodyLean: 0}},
]

/** 测试武器段配置（id 均带 test_weapon 前缀，避免与通用链段预设混淆）；
 * 冷却保留非 0 值作为冷却机制验证夹具（charge = 特殊蓄力技，非普通攻击） */
export const TEST_WEAPON_SKILL_CONFIGS = {
    /* 蓄力重劈：长按松开触发，单发无链 */
    test_weapon_charge: {
        id: 'test_weapon_charge', type: 'melee',
        cooldown: 1.2, duration: 0.42, recovery: 0.28, weapon: TEST_WEAPON,
        phases: segmentPhases(), swingTilt: 0,
    },
    /* 点按轻击起手（轻键组兜底） */
    test_weapon_tap: {
        id: 'test_weapon_tap', type: 'melee',
        cooldown: 0.3, duration: 0.2, recovery: 0.2, weapon: TEST_WEAPON,
        phases: segmentPhases(), swingTilt: 0,
    },
    /* 重击起手（重键组） */
    test_weapon_heavy_1: {
        id: 'test_weapon_heavy_1', type: 'melee',
        cooldown: 0.6, duration: 0.3, recovery: 0.2, weapon: TEST_WEAPON,
        phases: segmentPhases(), swingTilt: Math.PI * 0.48,
    },
    /* 方向突刺：链下一段变体，守卫 = 有移动输入 */
    test_weapon_thrust: {
        id: 'test_weapon_thrust', type: 'melee',
        cooldown: 0, duration: 0.2, recovery: 0.2, weapon: TEST_WEAPON,
        phases: segmentPhases(),
    },
    /* 轻链第二段（链下一段兜底） */
    test_weapon_light_2: {
        id: 'test_weapon_light_2', type: 'melee',
        cooldown: 0, duration: 0.2, recovery: 0.2, weapon: TEST_WEAPON,
        phases: segmentPhases(), swingTilt: -Math.PI * 0.22,
    },
    /* 重链第二段 */
    test_weapon_heavy_2: {
        id: 'test_weapon_heavy_2', type: 'melee',
        cooldown: 0, duration: 0.3, recovery: 0.2, weapon: TEST_WEAPON,
        phases: segmentPhases(), swingTilt: Math.PI * 0.48,
    },
} as const satisfies Record<string, MeleeSkillConfig>

/**
 * 装配测试武器技能槽。
 * 槽序即声明优先级：charge（轻键组守卫变体）先于 tap（轻键组兜底）；
 * heavy_1 虽在索引 2，但 entryGroup = 1 → 重击键（skillIndex 1）可命中。
 */
export const buildTestWeaponSkillSlots = (): SkillSlot[] => [
    {config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_charge, cooldownTimer: 0, isChainEntry: true, entryGroup: 0, triggerGuard: holdAtLeast(TEST_WEAPON_CHARGE_HOLD)},
    {config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_tap, cooldownTimer: 0, comboChain: ['test_weapon_thrust', 'test_weapon_light_2'], isChainEntry: true, entryGroup: 0},
    {config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_heavy_1, cooldownTimer: 0, comboChain: ['test_weapon_heavy_2'], isChainEntry: true, entryGroup: 1},
    {config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_thrust, cooldownTimer: 0, comboChain: ['test_weapon_tap'], triggerGuard: hasMoveInput},
    {config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_light_2, cooldownTimer: 0, comboChain: ['test_weapon_tap']},
    {config: TEST_WEAPON_SKILL_CONFIGS.test_weapon_heavy_2, cooldownTimer: 0, comboChain: ['test_weapon_heavy_1']},
]
