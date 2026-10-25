import type { WeaponMeshConfig } from './mesh_config.ts'
import type { StringLocaleKey } from '../../i18n/index.ts'
import type { DamageType } from '../combat/damage_type.ts'
import type { AttackModuleDef, AttackModuleId } from './attack_module.ts'
import type { AttackModuleAttacks, WeaponAttacks } from './attack_chain.ts'
import { withAttackSlotKeyMap, withChargeTuningMap } from './attack_chain.ts'
import { buildMeleeAttacks, DEFAULT_HEAVY_CHARGE, DEFAULT_MELEE_AIR_ATTACK, type BuildMeleeAttacksOptions, type HeavyChargeConfig, type MeleeAirAttackConfig, type MeleeAirSegmentKey, type MeleeSegmentKey } from './melee_attacks.ts'
import type { AttackImpulse } from './attack_chain.ts'
import type { WeaponAttackBoxSpec } from './mesh_config.ts'
import type { EquipmentColliderSpec, EquipmentHurtBoxSpec, EquipmentMountSpec } from '../equipment/types.ts'
import type { WeaponModelConfig } from './weapon_class.ts'
import type { ShieldBlockConfig } from './constants.ts'
import type { StaminaModifierSet } from '../stamina/types.ts'

/**
 * 攻击检测箱（AI 出招触发判定专用，与红色伤害判定箱解耦）：
 * 每项显式绑定骨骼节点 + 局部偏移 + 局部旋转；按角色 scale 缩放。
 * 攻击触发判定遍历武器上的全部检测箱，任一项与目标相交即视为在范围内。
 */
export interface MeleeDetectBoxSpec {
    /** 绑定骨骼节点 id */
    readonly jointId: string
    /** 盒尺寸：x = 侧向宽、y = 竖直高、z = 前后深（m，scale=1） */
    readonly size: { readonly x: number; readonly y: number; readonly z: number }
    /** 盒中心相对绑定关节局部的偏移（m，scale=1） */
    readonly offset: { readonly x: number; readonly y: number; readonly z: number }
    /** 相对绑定关节局部的欧拉角（弧度，XYZ；缺省 0） */
    readonly rotation: { readonly x: number; readonly y: number; readonly z: number }
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
     * 天然武器类别（空手 / 撕咬 / 爪击 / 踢击）：无可视模型；动作关键帧由所属 **体形分包** 提供，
     * 人形空手与其它武器一样进入骨骼编辑器动作库。
     */
    readonly natural?: boolean
    /**
     * 武器挂点关节 id（可选；仅生物体形使用）：覆盖体形默认主挂点（如马踢击挂后/前蹄、飞龙爪击挂翼爪）。
     * 缺省 = 体形 `createModel` 的默认主挂点（人形忽略此字段）。
     */
    readonly mountJointId?: string
    /** 生物武器挂点局部欧拉角（可选；如狼口含剑横置）；缺省 = 体形默认握持姿态 */
    readonly mountRotation?: readonly [number, number, number]
    /** 攻击类别（武器固有，不可被存档/面板覆写）：决定按哪一类防御结算固定减伤 */
    readonly damageType: DamageType
    readonly damage: number
    readonly knockbackForce: number
    readonly knockbackY: number
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 攻击检测箱数组：逐项绑定骨骼节点，驱动出招触发判定 */
    readonly detectBoxes: readonly MeleeDetectBoxSpec[]
    /** 动作时间倍率（缺省 1；盾牌等重型武器可整体放慢，2:1:2.5 阶段比例不变） */
    readonly timeScale?: number
    /** 装备时对角色体力消耗 / 恢复的修正（缺省 = 无修正） */
    readonly stamina?: StaminaModifierSet
    /** 可支持的攻击模组（数组；首个为默认模组，换武器时角色模组重置为首个） */
    readonly attackModules: readonly AttackModuleDef[]
    /** 攻击模组 → 攻击链 map（键 = `attackModules` 中受支持的模组；动画为段引用的 pose 组合） */
    readonly attacks: AttackModuleAttacks
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
     * 提供遮挡减免与格挡槽；短按仍照常出招（盾击）。详见 `constants.ts`。
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
    /** 该武器可装备的部位 id（体形 `EquipSlotDef.bodyPart`） */
    readonly equipBodyParts: readonly string[]
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
    /** 逐骨骼节点挂载配置（缺省 = 槽位/惯用手解析单挂载） */
    readonly mounts?: readonly EquipmentMountSpec<WeaponMeshConfig>[]
    /** 攻击箱数组（显式声明；缺省 = 由网格模板在装备时生成一项并绑定槽位主挂点） */
    readonly attackBoxes: readonly WeaponAttackBoxSpec[]
    /** 装备扩展碰撞体（现有武器为空数组） */
    readonly colliders?: readonly EquipmentColliderSpec[]
    /** 装备扩展受击箱（现有武器为空数组） */
    readonly hurtBoxes?: readonly EquipmentHurtBoxSpec[]
}

/** 近战武器类的各攻击模组链编排（未声明的模组不注入攻击链） */
export type MeleeModuleChains = Readonly<Partial<Record<AttackModuleId, BuildMeleeAttacksOptions>>>

/**
 * 近战武器类装配：按支持的攻击模组逐一注入固有攻击链。
 * 由各体形的 `weapons.ts` 调用（武器类数据由所属体形拥有）。
 */
export const meleeClass = (
    base: Omit<MeleeWeaponClassConfig, 'attacks'>,
    moduleChains: MeleeModuleChains,
): MeleeWeaponClassConfig => {
    const attacks: Partial<Record<AttackModuleId, WeaponAttacks>> = {}
    const heavyCharge = base.heavyCharge ?? DEFAULT_HEAVY_CHARGE
    const airAttack: MeleeAirAttackConfig = {...DEFAULT_MELEE_AIR_ATTACK, ...base.airAttack}
    for (const module of base.attackModules) {
        const options = moduleChains[module.id]
        if (options === undefined) continue
        attacks[module.id] = buildMeleeAttacks(base.id, module.id, {
            ...options,
            timeScale: base.timeScale ?? 1,
            heavyCharge,
            air: {...airAttack, ...(options.air ?? {})},
            impulses: options.impulses ?? base.impulses,
        })
    }
    return {...base, heavyCharge, airAttack, attacks}
}

/** 合并近战武器类固有属性与模型，得到运行时 / 面板 / 存档统一使用的武器配置 */
export const resolveMeleeWeapon = (weaponClass: MeleeWeaponClassConfig, model: WeaponModelConfig): MeleeWeaponConfig => {
    /* 蓄力调参：武器模板默认，单武器（模型）可覆盖；覆写后同步重烘焙攻击链中可蓄力段的字段 */
    const heavyCharge: HeavyChargeConfig = model.charge === undefined
        ? (weaponClass.heavyCharge ?? DEFAULT_HEAVY_CHARGE)
        : {...(weaponClass.heavyCharge ?? DEFAULT_HEAVY_CHARGE), ...model.charge}
    const slotKey = model.equipBodyParts[0]
    const attacks = model.charge === undefined
        ? weaponClass.attacks
        : withChargeTuningMap(weaponClass.attacks, heavyCharge)
    return {
        ...weaponClass,
        heavyCharge,
        /* 仅在单武器有蓄力覆写时重烘焙攻击链（否则沿用类共享数据） */
        attacks: slotKey !== undefined ? withAttackSlotKeyMap(attacks, `weapon:${slotKey}`) : attacks,
        classId: model.classId,
        id: model.id,
        formId: model.formId,
        name: model.name,
        nameKey: model.nameKey,
        equipBodyParts: model.equipBodyParts,
        mesh: model.mesh,
        mounts: model.mounts,
        attackBoxes: model.attackBoxes ?? [],
        colliders: model.colliders ?? [],
        hurtBoxes: model.hurtBoxes ?? [],
    }
}
