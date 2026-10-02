/**
 * 弹丸视觉规格 —— 远程武器类固有数据（纯描述，不含 Three.js 类型）。
 *
 * 由 `entity/character/projectile/mesh.ts` 消费并映射为具体网格：
 * - `arrow` / `bolt` / `bullet`：程序化箭矢 / 弩矢 / 弹头；
 * - `thrown_weapon`：直接复用武器自身模型（飞斧 / 飞镖 / 手雷 / 燃烧瓶）；
 * - `magic_orb`：发光魔法球 + 轨迹特效（法杖 / 魔杖）。
 *
 * 该规格只描述「弹丸长什么样」，不参与玩法数值（速度 / 伤害 / 重力等由
 * `RangedWeaponClassConfig` 的对应字段负责）。
 */

/** 弹丸视觉种类常量集 */
export const PROJECTILE_VISUAL_KINDS = ['arrow', 'bolt', 'bullet', 'thrown_weapon', 'magic_orb'] as const
export type ProjectileVisualKind = typeof PROJECTILE_VISUAL_KINDS[number]

/** 范围伤害命中特效风格常量集（火光 / 碎片 / 魔法爆散） */
export const EXPLOSION_STYLES = ['fire', 'frag', 'magic'] as const
export type ExplosionStyle = typeof EXPLOSION_STYLES[number]

export interface ProjectileVisualSpec {
    readonly kind: ProjectileVisualKind
    /**
     * 主色（魔法球核心 / 轨迹）。
     * 缺省时由武器模型颜色推导（法杖取 `orbColor`、魔杖取 `gemColor`），
     * 因此在武器类里通常无需重复声明。
     */
    readonly color?: number
    /** 是否自旋（投掷物翻滚）；缺省 false */
    readonly spin?: boolean
    /** 范围伤害命中特效风格；`explosionRadius > 0` 时生效，缺省由伤害类别决定 */
    readonly explosionStyle?: ExplosionStyle
}
