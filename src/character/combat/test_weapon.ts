import type {MeleeWeaponConfig} from '../weapon/melee_weapon.ts'
import type {HoldMode} from '../weapon/hold_mode.ts'
import type {WeaponAttacks, AttackSegment} from '../weapon/attack_chain.ts'
import {hasMoveInput, holdAtLeast} from '../weapon/attack_chain.ts'
import {registerWeaponPreset} from '../weapon/catalog.ts'
import {createWeaponRuntime, type WeaponRuntime} from '../weapon/weapon_runtime.ts'
import type {AttackPhase} from './attack_phases.ts'

/**
 * 测试武器（test_weapon）— 仅供单元测试 / 连段机制验证，不进生产武器列表（MELEE_WEAPON_PRESETS）。
 * 覆盖的连段情况（全部通过**段自身的 next 转换 + 起手守卫**表达）：
 * - 蓄力起手：轻击键长按 >= TEST_WEAPON_CHARGE_HOLD 松开触发 charge（起手候选守卫 holdAtLeast）
 * - 点按兜底起手：同键组无守卫兜底 tap（守卫变体 charge 声明在其之前 → 条件优先）
 * - 键组分离：重击键独立 heavy 链
 * - 方向组合键：tap 的 next 候选 [thrust(守卫 hasMoveInput), light_2(兜底)]
 * - 循环链：tap ↔ light_2、heavy_1 ↔ heavy_2；thrust 播完回 tap
 * - 无链单发：charge 的 next 为空（链终止）
 * - 冷却：charge 1.2s / tap 0.3s / heavy_1 0.6s 非 0，作为冷却机制验证夹具
 */

export const TEST_WEAPON_ID = 'test_weapon'

/** 蓄力阈值（秒）：攻击键按住时长 >= 该值时松开触发蓄力段 */
export const TEST_WEAPON_CHARGE_HOLD = 0.5

/** 段阶段序列：strike 动作段（ratio = 1，时长取段 duration）+ recovery 恢复段（时长取段 recovery） */
const segmentPhases = (): readonly AttackPhase[] => [
    {name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false},
    {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.35, cancellable: false},
]

/** 测试武器攻击链（段 id 均带 test_weapon 前缀，避免与生产段 id 混淆） */
const buildTestWeaponAttacks = (): WeaponAttacks => {
    const pose = (id: string): readonly {poseId: string; weight: number}[] => [{poseId: id, weight: 1}]
    const charge: AttackSegment = {
        id: 'test_weapon_charge', key: 'light', step: 1, label: '蓄力重劈',
        duration: 0.42, recovery: 0.28, phases: segmentPhases(), poses: pose('test_weapon_charge'),
        damageMultiplier: 1, cooldown: 1.2, next: [],
    }
    const tap: AttackSegment = {
        id: 'test_weapon_tap', key: 'light', step: 1, label: '点按轻击',
        duration: 0.2, recovery: 0.2, phases: segmentPhases(), poses: pose('test_weapon_tap'),
        damageMultiplier: 1, cooldown: 0.3,
        next: [{to: 'test_weapon_thrust', guard: hasMoveInput}, {to: 'test_weapon_light_2'}],
    }
    const thrust: AttackSegment = {
        id: 'test_weapon_thrust', key: 'light', step: 2, label: '方向突刺',
        duration: 0.2, recovery: 0.2, phases: segmentPhases(), poses: pose('test_weapon_thrust'),
        damageMultiplier: 1, cooldown: 0,
        next: [{to: 'test_weapon_tap'}],
    }
    const light2: AttackSegment = {
        id: 'test_weapon_light_2', key: 'light', step: 2,
        duration: 0.2, recovery: 0.2, phases: segmentPhases(), poses: pose('test_weapon_light_2'),
        damageMultiplier: 1, cooldown: 0,
        next: [{to: 'test_weapon_tap'}],
    }
    const heavy1: AttackSegment = {
        id: 'test_weapon_heavy_1', key: 'heavy', step: 1,
        duration: 0.3, recovery: 0.2, phases: segmentPhases(), poses: pose('test_weapon_heavy_1'),
        damageMultiplier: 1, cooldown: 0.6,
        next: [{to: 'test_weapon_heavy_2'}],
    }
    const heavy2: AttackSegment = {
        id: 'test_weapon_heavy_2', key: 'heavy', step: 2,
        duration: 0.3, recovery: 0.2, phases: segmentPhases(), poses: pose('test_weapon_heavy_2'),
        damageMultiplier: 1, cooldown: 0,
        next: [{to: 'test_weapon_heavy_1'}],
    }
    const segments: Record<string, AttackSegment> = {}
    for (const segment of [charge, tap, thrust, light2, heavy1, heavy2]) segments[segment.id] = segment

    return {
        segments,
        chains: {
            /* 起手候选顺序即优先级：蓄力守卫变体在前、点按兜底在后 */
            light: {
                key: 'light',
                entries: [
                    {segmentId: 'test_weapon_charge', guard: holdAtLeast(TEST_WEAPON_CHARGE_HOLD)},
                    {segmentId: 'test_weapon_tap'},
                ],
                steps: ['test_weapon_tap', 'test_weapon_light_2'],
            },
            heavy: {
                key: 'heavy',
                entries: [{segmentId: 'test_weapon_heavy_1'}],
                steps: ['test_weapon_heavy_1', 'test_weapon_heavy_2'],
            },
        },
    }
}

export const TEST_WEAPON: MeleeWeaponConfig = {
    id: TEST_WEAPON_ID, name: '测试武器', type: 'melee',
    holdModes: ['one_handed'],
    damage: 3,
    knockbackForce: 4, knockbackY: 2,
    detectionRange: 8,
    detectBox: {size: {x: 0.45, y: 1.1, z: 1.3}, offset: {x: 0, y: 0, z: 0.45}},
    mesh: {id: 'sword', bladeLen: 0.45, color: 0x55cc88, gripColor: 0x334433},
    attacks: {one_handed: buildTestWeaponAttacks()},
}

/** 创建测试武器运行时（注册额外预设后解析；生产装配对 TEST_WEAPON_ID 特判调用本函数） */
export const createTestWeaponRuntime = (holdMode?: HoldMode): WeaponRuntime => {
    registerWeaponPreset(TEST_WEAPON)
    return createWeaponRuntime(TEST_WEAPON_ID, {}, holdMode)
}
