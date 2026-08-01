/** 伤害来源描述 — 经过 modifier 管线后的最终数据 */
export interface DamageEvent {
    readonly sourceId: number
    readonly targetId: number
    readonly baseAmount: number
    readonly finalAmount: number
    readonly skillId: string
}

/** 伤害修饰器：在最终扣血前修改伤害值 */
export type DamageModifier = (event: DamageEvent) => DamageEvent

/** 统一伤害应用 — 遍历 modifier → 扣血 → 触发回调（不设 isDead，由状态机 dying 处理） */
export const applyDamage = (
    target: {
        health: number
        maxHealth: number
        readonly damageModifiers?: readonly DamageModifier[]
        onDamageTaken: ((amount: number) => void) | null
        onDeath: (() => void) | null
    },
    event: DamageEvent,
): DamageEvent => {
    let finalEvent = event
    if (target.damageModifiers) {
        for (const mod of target.damageModifiers) {
            finalEvent = mod(finalEvent)
        }
    }
    target.health = Math.max(0, target.health - finalEvent.finalAmount)
    target.onDamageTaken?.(finalEvent.finalAmount)

    if (target.health <= 0) {
        target.onDeath?.()
    }
    return finalEvent
}
