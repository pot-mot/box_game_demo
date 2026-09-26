import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'
import type { HoldMode } from './hold_mode.ts'
import type { HoldModeAttacks } from './attack_chain.ts'
import { holdAtLeast } from './attack_chain.ts'
import { buildMeleeAttacks, type BuildMeleeAttacksOptions } from './melee_attacks.ts'
import { SPEAR_CHARGE_HOLD, SPEAR_CHARGE_THRUST } from './melee_special_moves.ts'

/**
 * 攻击检测箱（AI 出招触发判定专用，与红色伤害判定箱解耦）：
 * 盒尺寸 + 相对身体中心的偏移；身体局部坐标（+Z = 朝向），按角色 scale 缩放。
 * 攻击触发判定由武器上的这个属性直接驱动。
 */
export interface MeleeDetectBox {
    /** 盒尺寸：x = 侧向宽、y = 竖直高、z = 前后深（m，scale=1） */
    readonly size: { readonly x: number; readonly y: number; readonly z: number }
    /** 盒中心相对身体中心的偏移：z 正向 = 朝向前方（m，scale=1） */
    readonly offset: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * 近战武器配置 — 玩家装备该武器的全部固有属性。
 * **攻击动作（轻重链/段/时长/阶段时序/伤害倍率）由武器模组拥有**（`attacks`），
 * 角色实体只持有武器与数值覆写，不再维护技能槽位与连段索引。
 */
export interface MeleeWeaponConfig {
    readonly id: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    readonly type: 'melee'
    readonly damage: number
    readonly knockbackForce: number
    readonly knockbackY: number
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 攻击检测箱：尺寸 + 身体偏移，驱动出招触发判定 */
    readonly detectBox: MeleeDetectBox
    /** 可支持的持握模式（数组；首个为默认模式，换武器时角色持握模式重置为首个） */
    readonly holdModes: readonly HoldMode[]
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
    /** 副手（左手）武器模型；`dual_wield` 模式的副手武器（如双斧）；undefined = 无副手武器 */
    readonly offhandMesh?: WeaponMeshConfig
    /** 持握模式 → 攻击链 map（键 = `holdModes` 中受支持的模式；动画为段引用的 pose 组合） */
    readonly attacks: HoldModeAttacks
}

/** 近战预设装配：按武器 id + 默认持握模式注入固有攻击链 */
const meleePreset = (
    base: Omit<MeleeWeaponConfig, 'attacks'>,
    attackOptions: BuildMeleeAttacksOptions = {},
): MeleeWeaponConfig => {
    const attacks: Partial<Record<HoldMode, ReturnType<typeof buildMeleeAttacks>>> = {}
    attacks[base.holdModes[0]] = buildMeleeAttacks(base.id, attackOptions)
    return {...base, attacks}
}

export const MELEE_WEAPON_PRESETS: Record<string, MeleeWeaponConfig> = {
    short_sword: meleePreset({
        id: 'short_sword', name: '短剑', type: 'melee',
        holdModes: ['one_handed'],
        damage: 2,
        knockbackForce: 2, knockbackY: 1,
        detectionRange: 6,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422 },
    }),
    long_sword: meleePreset({
        id: 'long_sword', name: '长剑', type: 'melee',
        /* 长剑可单持亦可双手共持（演示多持握模式：默认单持，切换双手共用同一套动作） */
        holdModes: ['one_handed', 'two_handed'],
        damage: 3,
        knockbackForce: 5, knockbackY: 2,
        detectionRange: 8,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322 },
    }),
    /* 巨剑：轻型链加长为三段（轻 1 → 轻 2 → 轻 3 循环），重链保持两段 */
    heavy_sword: meleePreset({
        id: 'heavy_sword', name: '巨剑', type: 'melee',
        holdModes: ['two_handed'],
        damage: 8,
        knockbackForce: 8, knockbackY: 3,
        detectionRange: 10,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211 },
    }, {
        chains: {light: {steps: ['light_1', 'light_2', 'light_3'], loop: true}},
    }),
    /* 长枪：轻击键增加蓄力突刺变体（长按 >= SPEAR_CHARGE_HOLD 松开触发；冷却中自动回退到轻 1 段） */
    spear: meleePreset({
        id: 'spear', name: '长枪', type: 'melee',
        holdModes: ['two_handed'],
        damage: 5,
        knockbackForce: 4, knockbackY: 1,
        detectionRange: 10,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa },
    }, {
        /* 起手候选顺序 = 优先级：守卫变体（蓄力）在前、无守卫兜底（轻 1）在后 */
        extraSegments: [SPEAR_CHARGE_THRUST],
        entries: {
            light: [
                {segmentId: SPEAR_CHARGE_THRUST.id, guard: holdAtLeast(SPEAR_CHARGE_HOLD)},
                {segmentId: 'spear_light_1'},
            ],
        },
    }),
    /* 双斧：左右手各一把单刃斧（双持）——斧刃几何关于矢状面对称，副手与主手同网格；
     * 攻击段副手相位错开半程（交替挥砍） */
    dual_axe: meleePreset({
        id: 'dual_axe', name: '双斧', type: 'melee',
        holdModes: ['dual_wield'],
        damage: 6,
        knockbackForce: 7, knockbackY: 2,
        detectionRange: 7,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322 },
        offhandMesh: { id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322 },
    }),
    war_hammer: meleePreset({
        id: 'war_hammer', name: '战锤', type: 'melee',
        holdModes: ['two_handed'],
        damage: 10,
        knockbackForce: 10, knockbackY: 4,
        detectionRange: 8,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'war_hammer', headSize: 0.35, color: 0x777777, gripColor: 0x443311 },
    }),
}
