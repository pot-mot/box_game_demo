import {DEFAULT_ANIM, type AttackPhase} from '../combat/attack_phases.ts'
import type {AttackSegment} from './attack_chain.ts'

/**
 * 近战特殊段（条件变体动作）——武器模组内既有主干段模板之外的独立动作：
 * 与模板段一样是纯数据（id / 攻击键 / 时长 / 阶段 / 倾斜角 / 伤害倍率 / 冷却 / next），
 * 通过 `buildMeleeAttacks` 的 `extraSegments` + `entries`（起手守卫）或其它段的 `next` 接入。
 *
 * 当前唯一实例：长枪「蓄力突刺」——长按轻击键（>= SPEAR_CHARGE_HOLD 秒）松开触发，
 * 单发无连段、伤害倍率更高、带冷却（冷却期间起手解析自动回退到轻 1 段）。
 */

/** 长枪蓄力阈值（秒）：轻击键按住时长 >= 该值时松开触发蓄力突刺 */
export const SPEAR_CHARGE_HOLD = 0.5

/** 蓄力突刺的段 id（动画键与清单键；命名沿用 `{weaponId}_{动作}` 约定） */
export const SPEAR_CHARGE_THRUST_ID = 'spear_charge_thrust'

/** 段阶段序列：strike（突进刺出，移动倍率更低 = 出招更定身）+ recovery */
const chargeThrustPhases = (): readonly AttackPhase[] => [
    {
        name: 'strike',
        durationRatio: 1,
        moveSpeedMultiplier: 0.2,
        cancellable: false,
        /* 蓄力突刺：更大幅度的双手直刺 + 明显探身 */
        animConfig: {
            ...DEFAULT_ANIM,
            armSwingBackX: -1.9,
            armSwingForwardX: 2.8,
            elbowBend: 0.1,
            bodyLean: 0.18,
            twoHanded: true,
            attackType: 'thrust',
            strikePeakRatio: 0.62,
            overshootRatio: 0.25,
        },
    },
    {
        name: 'recovery',
        durationRatio: 0,
        moveSpeedMultiplier: 0.35,
        cancellable: false,
        animConfig: {...DEFAULT_ANIM, elbowBend: 0.25, twoHanded: true},
    },
]

/** 长枪蓄力突刺段定义（`next` 为空 = 单发，播完收招） */
export const SPEAR_CHARGE_THRUST: AttackSegment = {
    id: SPEAR_CHARGE_THRUST_ID,
    key: 'light',
    step: 1,
    label: '蓄力突刺',
    duration: 0.45,
    recovery: 0.3,
    phases: chargeThrustPhases(),
    swingTilt: 0,
    damageMultiplier: 1.8,
    cooldown: 0.8,
    next: [],
}
