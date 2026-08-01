/** 被攻击能力接口 */
export interface Damageable {
    readonly entityId: number
    health: number
    readonly maxHealth: number
    isDead: boolean
    onDamageTaken: ((amount: number) => void) | null
    onDeath: (() => void) | null
}
