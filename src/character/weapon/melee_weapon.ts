import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'
import type { DamageType } from '../combat/damage_type.ts'
import type { HoldMode } from './hold_mode.ts'
import type { HoldModeAttacks, WeaponAttacks } from './attack_chain.ts'
import { holdAtLeast } from './attack_chain.ts'
import { buildMeleeAttacks, meleeSegmentId, type BuildMeleeAttacksOptions } from './melee_attacks.ts'
import { SPEAR_CHARGE_HOLD, spearChargeThrust, spearChargeThrustId } from './melee_special_moves.ts'
import type { WeaponModelConfig } from './weapon_class.ts'

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
 * 近战武器类（weapon class）— 同类全部模型共享的固有属性。
 * **攻击动作（轻重链/段/时长/阶段时序/伤害倍率）由武器类拥有**（`attacks`），
 * 段 id 由类 id + 持握模式 + 模板键生成（`melee_attacks.ts` 的 `meleeSegmentId`）。
 */
export interface MeleeWeaponClassConfig {
    readonly id: string
    readonly type: 'melee'
    /** 攻击类别（武器固有，不可被存档/面板覆写）：决定按哪一类防御结算固定减伤 */
    readonly damageType: DamageType
    readonly damage: number
    readonly knockbackForce: number
    readonly knockbackY: number
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 攻击检测箱：尺寸 + 身体偏移，驱动出招触发判定 */
    readonly detectBox: MeleeDetectBox
    /** 可支持的持握模式（数组；首个为默认模式，换武器时角色持握模式重置为首个） */
    readonly holdModes: readonly HoldMode[]
    /** 持握模式 → 攻击链 map（键 = `holdModes` 中受支持的模式；动画为段引用的 pose 组合） */
    readonly attacks: HoldModeAttacks
}

/** 解析后的近战武器 = 武器类固有属性 + 所属模型（模型 id / 名称 / 网格） */
export interface MeleeWeaponConfig extends MeleeWeaponClassConfig {
    /** 所属武器类 id（双持同类判定用；见 catalog.ts 的 sameWeaponClass） */
    readonly classId: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
}

/** 近战武器类的各持握模式链编排（未声明的模式不注入攻击链） */
export type MeleeModeChains = Readonly<Partial<Record<HoldMode, BuildMeleeAttacksOptions>>>

/** 近战武器类装配：按支持的持握模式逐一注入固有攻击链 */
const meleeClass = (
    base: Omit<MeleeWeaponClassConfig, 'attacks'>,
    modeChains: MeleeModeChains,
): MeleeWeaponClassConfig => {
    const attacks: Partial<Record<HoldMode, WeaponAttacks>> = {}
    for (const mode of base.holdModes) {
        const options = modeChains[mode]
        if (options === undefined) continue
        attacks[mode] = buildMeleeAttacks(base.id, mode, options)
    }
    return {...base, attacks}
}

/**
 * 近战武器类目录（键 = 类 id）。全部近战类支持单持 / 双手共持 / 双持三模式，默认单持；
 * 每种模式有独立连段（段 id = `{classId}_{holdMode}_{模板键}`）。
 */
export const MELEE_WEAPON_CLASSES: Record<string, MeleeWeaponClassConfig> = {
    short_sword: meleeClass({
        id: 'short_sword', type: 'melee',
        damageType: 'physical',
        holdModes: ['one_handed', 'two_handed', 'dual_wield'],
        damage: 2,
        knockbackForce: 2, knockbackY: 1,
        detectionRange: 6,
        /* 前缘 = (0.5 + reach 0.3125) × 0.8 = 0.65，外扩 +0.05 见 docs/ai_system.md 2.5.1 */
        detectBox: { size: { x: 0.5, y: 1.15, z: 0.8 }, offset: { x: 0, y: 0, z: 0.275 } },
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    long_sword: meleeClass({
        id: 'long_sword', type: 'melee',
        damageType: 'physical',
        holdModes: ['one_handed', 'two_handed', 'dual_wield'],
        damage: 3,
        knockbackForce: 5, knockbackY: 2,
        detectionRange: 8,
        /* 前缘 = (0.5 + reach 0.4875) × 0.8 = 0.79 */
        detectBox: { size: { x: 0.5, y: 1.15, z: 0.94 }, offset: { x: 0, y: 0, z: 0.345 } },
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    /* 巨剑：双手链轻型链加长为三段（轻 1 → 轻 2 → 轻 3 循环），重链保持两段 */
    heavy_sword: meleeClass({
        id: 'heavy_sword', type: 'melee',
        damageType: 'physical',
        holdModes: ['one_handed', 'two_handed', 'dual_wield'],
        damage: 8,
        knockbackForce: 8, knockbackY: 3,
        detectionRange: 10,
        /* 前缘 = (0.5 + reach 0.6025) × 0.8 = 0.882 */
        detectBox: { size: { x: 0.5, y: 1.15, z: 1.032 }, offset: { x: 0, y: 0, z: 0.391 } },
    }, {
        one_handed: {},
        two_handed: {chains: {light: {steps: ['light_1', 'light_2', 'light_3'], loop: true}}},
        dual_wield: {},
    }),
    /* 长枪：双手链轻击键增加蓄力突刺变体（长按 >= SPEAR_CHARGE_HOLD 松开触发；冷却中自动回退到轻 1 段） */
    spear: meleeClass({
        id: 'spear', type: 'melee',
        damageType: 'physical',
        holdModes: ['one_handed', 'two_handed', 'dual_wield'],
        damage: 5,
        knockbackForce: 4, knockbackY: 1,
        detectionRange: 10,
        /* 前缘 = (0.5 + reach 1.17) × 0.8 = 1.336（长杆武器攻击距离优势） */
        detectBox: { size: { x: 0.5, y: 1.15, z: 1.486 }, offset: { x: 0, y: 0, z: 0.618 } },
    }, {
        one_handed: {},
        two_handed: {
            /* 起手候选顺序 = 优先级：守卫变体（蓄力）在前、无守卫兜底（轻 1）在后 */
            extraSegments: [spearChargeThrust('spear', 'two_handed')],
            entries: {
                light: [
                    {segmentId: spearChargeThrustId('spear', 'two_handed'), guard: holdAtLeast(SPEAR_CHARGE_HOLD)},
                    {segmentId: meleeSegmentId('spear', 'two_handed', 'light_1')},
                ],
            },
        },
        dual_wield: {},
    }),
    /* 双斧：同为单刃斧（斧刃几何关于矢状面对称），双持时左右手各一把同类武器，副手相位错开半程（交替挥砍） */
    dual_axe: meleeClass({
        id: 'dual_axe', type: 'melee',
        damageType: 'physical',
        holdModes: ['one_handed', 'two_handed', 'dual_wield'],
        damage: 6,
        knockbackForce: 7, knockbackY: 2,
        detectionRange: 7,
        /* 前缘 = (0.5 + reach 0.4193) × 0.8 = 0.73544 */
        detectBox: { size: { x: 0.5, y: 1.15, z: 0.88544 }, offset: { x: 0, y: 0, z: 0.31772 } },
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    war_hammer: meleeClass({
        id: 'war_hammer', type: 'melee',
        damageType: 'physical',
        holdModes: ['one_handed', 'two_handed', 'dual_wield'],
        damage: 10,
        knockbackForce: 10, knockbackY: 4,
        detectionRange: 8,
        /* 前缘 = (0.5 + reach 0.4875) × 0.8 = 0.79（战锤握把偏低，reach 已计入 gripY） */
        detectBox: { size: { x: 0.5, y: 1.15, z: 0.94 }, offset: { x: 0, y: 0, z: 0.345 } },
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
}

/** 近战武器模型目录（键 = 模型 id；当前每类只有默认模型，模型 id = 类 id） */
export const MELEE_WEAPON_MODELS: Record<string, WeaponModelConfig> = {
    short_sword: {
        id: 'short_sword', classId: 'short_sword', name: '短剑',
        mesh: { id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422 },
    },
    long_sword: {
        id: 'long_sword', classId: 'long_sword', name: '长剑',
        mesh: { id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322 },
    },
    heavy_sword: {
        id: 'heavy_sword', classId: 'heavy_sword', name: '巨剑',
        mesh: { id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211 },
    },
    spear: {
        id: 'spear', classId: 'spear', name: '长枪',
        mesh: { id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa },
    },
    dual_axe: {
        id: 'dual_axe', classId: 'dual_axe', name: '双斧',
        mesh: { id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322 },
    },
    war_hammer: {
        id: 'war_hammer', classId: 'war_hammer', name: '战锤',
        mesh: { id: 'war_hammer', headSize: 0.35, color: 0x777777, gripColor: 0x443311 },
    },
}

/** 合并武器类固有属性与模型，得到运行时 / 面板 / 存档统一使用的武器配置 */
export const resolveMeleeWeapon = (model: WeaponModelConfig): MeleeWeaponConfig => {
    const weaponClass = MELEE_WEAPON_CLASSES[model.classId]
    if (weaponClass === undefined) {
        throw new Error(`近战武器模型 ${model.id} 引用了未知武器类 ${model.classId}`)
    }
    return {...weaponClass, classId: model.classId, id: model.id, name: model.name, mesh: model.mesh}
}

/** 生产近战武器预设（当前 = 各类的默认模型解析结果；键 = 模型 id） */
export const MELEE_WEAPON_PRESETS: Record<string, MeleeWeaponConfig> = Object.fromEntries(
    Object.entries(MELEE_WEAPON_MODELS).map(([id, model]) => [id, resolveMeleeWeapon(model)]),
)
