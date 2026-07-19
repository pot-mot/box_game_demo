/** 可复用血量组件，Player / NPC / 可破坏物件等具有血量的实体均可组合此接口 */
export interface HealthComponent {
    health: number
    maxHealth: number
}

/** 将 health 钳制在 [0, maxHealth] 区间内 */
export const clampHealth = (comp: HealthComponent, value: number): void => {
    comp.health = Math.max(0, Math.min(value, comp.maxHealth))
}

/** maxHealth 缩小后同步下调 health，避免当前血量越界 */
export const clampHealthOnMaxChange = (comp: HealthComponent, newMax: number): void => {
    comp.maxHealth = newMax
    if (comp.health > newMax) comp.health = newMax
}
