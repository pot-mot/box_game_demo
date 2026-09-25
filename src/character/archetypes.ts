/**
 * 角色攻击配置（存档 / 属性面板）：
 * 只描述**装备的武器**与**数值覆写**；攻击动作（段 / 时长 / 动画）由武器模组的攻击链决定，
 * 因此这里不再有攻击类型（由武器隐含）、动作时长与连段索引字段。
 */

/** 攻击配置（角色存档/面板）：只描述装备武器与数值覆写，攻击动作由武器模组决定 */
export interface AttackConfig {
    /** 武器 id：MELEE_WEAPON_PRESETS / RANGED_WEAPON_PRESETS 的键（未知 id 回退默认武器） */
    readonly weaponId: string
    /** 伤害覆写（undefined = 取武器预设伤害） */
    readonly damage?: number
    /** 起手段冷却覆写（秒，undefined = 取段预设冷却） */
    readonly cooldown?: number
    /** 远程武器弹道数值覆写（仅远程武器需要） */
    readonly ranged?: {
        readonly range: number
        readonly bulletSpeed: number
        readonly bulletKnockback: number
        readonly bulletLifetime: number
    }
}

/** 攻击配置预设（新建角色的默认值） */
export const ATTACK_PRESETS = {
    melee: {weaponId: 'long_sword', damage: 3} as AttackConfig,
    ranged: {weaponId: 'longbow', damage: 2, ranged: {range: 10, bulletSpeed: 20, bulletKnockback: 3, bulletLifetime: 3}} as AttackConfig,
}
