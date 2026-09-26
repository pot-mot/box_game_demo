/** 伤害来源描述 — 经过 modifier 管线后的最终数据 */
export interface DamageEvent {
    readonly sourceId: number
    readonly targetId: number
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

/** 伤害修饰器：在最终扣血前修改伤害值 */
export type DamageModifier = (event: DamageEvent) => DamageEvent

/** 统一伤害应用 — 遍历 modifier → 扣血 → 触发回调（不设 isDead，由状态机 dying 处理） */
export const applyDamage = (
    target: {
        health: number
        maxHealth: number
        readonly damageModifiers?: readonly DamageModifier[]
        onDamageTaken: ((amount: number, event: DamageEvent) => void) | null
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
    target.onDamageTaken?.(finalEvent.finalAmount, finalEvent)

    if (target.health <= 0) {
        target.onDeath?.()
    }
    return finalEvent
}
