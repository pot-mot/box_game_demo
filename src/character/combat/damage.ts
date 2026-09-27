import type {DamageType} from './damage_type.ts'
import type {DefenseProfile} from './defense.ts'
import {reduceByDefense} from './defense.ts'

/** 伤害来源描述 — 经过 modifier 管线与目标防御结算后的最终数据 */
export interface DamageEvent {
    readonly sourceId: number
    readonly targetId: number
    /** 攻击类别（武器固有；决定按哪一类防御结算固定减伤） */
    readonly damageType: DamageType
    readonly baseAmount: number
    readonly finalAmount: number
    readonly skillId: string
    /**
     * 冲击方向（世界水平单位向量，来源 → 受击者；可选）：
     * 近战 = 武器握把 → 目标、远程 = 弹丸 → 目标、爆炸 = 爆心 → 目标。
     * 死亡 state 用它决定倒地方向（无该字段时默认向后倒）。
     */
    readonly dirX?: number
    readonly dirZ?: number
}

/** 伤害修饰器：在防御结算前修改伤害值 */
export type DamageModifier = (event: DamageEvent) => DamageEvent

/**
 * 目标当前是否处于伤害免疫（翻滚无敌帧）：`applyDamage` 据此完全免疫；
 * 三条命中路径（近战 / 远程 / 爆炸）也用它跳过击退、命中反馈与命中消耗，
 * 保证「无敌」在伤害与物理反馈上语义一致。
 */
export const isDamageImmune = (target: { readonly invincibleTimer?: number }): boolean =>
    (target.invincibleTimer ?? 0) > 0

/**
 * 统一伤害应用 — 遍历 modifier → 按目标对应类别防御固定减伤 → 扣血 → 触发回调（不设 isDead，由状态机 dying 处理）。
 * 结算顺序：修饰器 → 防御（最后一步，不可被修饰器绕过）；
 * `baseAmount` 始终保持原始伤害，`finalAmount` 为实际扣血值（最小 1 点）。
 */
export const applyDamage = (
    target: {
        health: number
        maxHealth: number
        /** 有效防御（缺省 = 不结算防御减伤；仅测试替身可不填） */
        readonly defense?: DefenseProfile
        /** 无敌帧剩余时间（秒，翻滚移动技能）：> 0 时完全免疫伤害，可选（仅测试替身可不填） */
        readonly invincibleTimer?: number
        readonly damageModifiers?: readonly DamageModifier[]
        onDamageTaken: ((amount: number, event: DamageEvent) => void) | null
        onDeath: (() => void) | null
    },
    event: DamageEvent,
): DamageEvent => {
    /* 无敌帧：不扣血、不触发受击回调（闪红 / 硬直 / 仇恨均不发生），也不判定死亡 */
    if (isDamageImmune(target)) {
        return {...event, finalAmount: 0}
    }
    let finalEvent = event
    if (target.damageModifiers) {
        for (const mod of target.damageModifiers) {
            finalEvent = mod(finalEvent)
        }
    }
    if (target.defense !== undefined) {
        finalEvent = {
            ...finalEvent,
            finalAmount: reduceByDefense(finalEvent.finalAmount, target.defense[finalEvent.damageType]),
        }
    }
    target.health = Math.max(0, target.health - finalEvent.finalAmount)
    target.onDamageTaken?.(finalEvent.finalAmount, finalEvent)

    if (target.health <= 0) {
        target.onDeath?.()
    }
    return finalEvent
}
