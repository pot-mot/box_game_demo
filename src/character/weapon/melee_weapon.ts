import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'
import type { StringLocaleKey } from '../../i18n/index.ts'
import type { DamageType } from '../combat/damage_type.ts'
import type { HoldMode } from './hold_mode.ts'
import type { HoldModeAttacks, WeaponAttacks } from './attack_chain.ts'
import { withChargeTuningMap } from './attack_chain.ts'
import { buildMeleeAttacks, DEFAULT_HEAVY_CHARGE, DEFAULT_MELEE_AIR_ATTACK, type BuildMeleeAttacksOptions, type HeavyChargeConfig, type MeleeAirAttackConfig, type MeleeAirSegmentKey, type MeleeSegmentKey } from './melee_attacks.ts'
import type { AttackImpulse } from './attack_chain.ts'
import type { WeaponModelConfig } from './weapon_class.ts'
import type { ShieldBlockConfig } from './constants.ts'

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
    /**
     * 天然武器类别（空手 / 撕咬 / 爪击 / 踢击）：无可视模型、无动画关键帧数据，
     * 动作由所属**体形分包**提供（不进骨骼编辑器人形动作库）。
     */
    readonly natural?: boolean
    /**
     * 武器挂点关节 id（可选；仅生物体形使用）：覆盖体形默认主挂点（如马踢击挂后/前蹄、飞龙爪击挂翼爪）。
     * 缺省 = 体形 `createModel` 的默认主挂点（人形忽略此字段）。
     */
    readonly mountJointId?: string
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
    /**
     * 重击蓄力配置（可选；缺省 = `DEFAULT_HEAVY_CHARGE`：满蓄力 1s、+100% 伤害、冷却 0.8s）。
     * 所有模式的攻击链都会生成对应的「蓄力重击」变体段。
     */
    readonly heavyCharge?: HeavyChargeConfig
    /**
     * 空中攻击模组（可选；缺省 = `DEFAULT_MELEE_AIR_ATTACK`）。
     * 「跳跃/下落中按攻击键」时由 `air_attacking` 状态读取：决定空中段数、每帧水平动量保留、
     * 操控系数与向下冲量（如战锤「跳跃砸地」；冲量在命中帧施加，而非起手瞬间）。所有模式共用同一套空中编排。
     */
    readonly airAttack?: Partial<MeleeAirAttackConfig>
    /**
     * 逐段自身冲击序列（可选；键 = 段模板键，地面与空中段共用命名空间）。
     * 段内时间轴到达 `impulse.at` 时对施术者施加一次速度冲量（砸地 / 突进 / 反冲），
     * 由全部持握模式共享（如战锤空中砸地的向下冲量）。缺省 = 无冲击。
     */
    readonly impulses?: Partial<Record<MeleeSegmentKey | MeleeAirSegmentKey, readonly AttackImpulse[]>>
    /**
     * 盾牌格挡能力（可选；仅盾类声明）。声明后该武器可长按攻击键举盾格挡，
     * 提供遮挡减免与格挡槽；短按仍照常出招（盾击）。详见 `constants.ts` 与 `docs/design/shield_block.md`。
     */
    readonly block?: ShieldBlockConfig
}

/** 解析后的近战武器 = 武器类固有属性 + 所属模型（模型 id / 体形 / 名称 / 网格） */
export interface MeleeWeaponConfig extends MeleeWeaponClassConfig {
    /** 所属武器类 id（双持同类判定用；见 catalog.ts 的 sameWeaponClass） */
    readonly classId: string
    /** 所属体形 id（`BodyForm.id`）；武器只对应一种体形 */
    readonly formId: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    /** 武器名本地化键（UI 展示统一经此取用） */
    readonly nameKey: StringLocaleKey
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
}

/** 近战武器类的各持握模式链编排（未声明的模式不注入攻击链） */
export type MeleeModeChains = Readonly<Partial<Record<HoldMode, BuildMeleeAttacksOptions>>>

/**
 * 近战武器类装配：按支持的持握模式逐一注入固有攻击链。
 * 由各体形的 `weapons.ts` 调用（武器类数据由所属体形拥有）。
 */
export const meleeClass = (
    base: Omit<MeleeWeaponClassConfig, 'attacks'>,
    modeChains: MeleeModeChains,
): MeleeWeaponClassConfig => {
    const attacks: Partial<Record<HoldMode, WeaponAttacks>> = {}
    const heavyCharge = base.heavyCharge ?? DEFAULT_HEAVY_CHARGE
    const airAttack: MeleeAirAttackConfig = {...DEFAULT_MELEE_AIR_ATTACK, ...base.airAttack}
    for (const mode of base.holdModes) {
        const options = modeChains[mode]
        if (options === undefined) continue
        attacks[mode] = buildMeleeAttacks(base.id, mode, {...options, heavyCharge, air: airAttack, impulses: options.impulses ?? base.impulses})
    }
    return {...base, heavyCharge, airAttack, attacks}
}

/** 合并近战武器类固有属性与模型，得到运行时 / 面板 / 存档统一使用的武器配置 */
export const resolveMeleeWeapon = (weaponClass: MeleeWeaponClassConfig, model: WeaponModelConfig): MeleeWeaponConfig => {
    /* 蓄力调参：武器模板默认，单武器（模型）可覆盖；覆写后同步重烘焙攻击链中可蓄力段的字段 */
    const heavyCharge: HeavyChargeConfig = model.charge === undefined
        ? (weaponClass.heavyCharge ?? DEFAULT_HEAVY_CHARGE)
        : {...(weaponClass.heavyCharge ?? DEFAULT_HEAVY_CHARGE), ...model.charge}
    return {
        ...weaponClass,
        heavyCharge,
        /* 仅在单武器有蓄力覆写时重烘焙攻击链（否则沿用类共享数据） */
        attacks: model.charge === undefined
            ? weaponClass.attacks
            : withChargeTuningMap(weaponClass.attacks, heavyCharge),
        classId: model.classId,
        id: model.id,
        formId: model.formId,
        name: model.name,
        nameKey: model.nameKey,
        mesh: model.mesh,
    }
}
