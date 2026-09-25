/**
 * 碰撞类别 —— 与「碰撞组」（交互掩码）解耦的语义标签，供投掷物等查询类逻辑识别「命中的是什么」。
 *
 * 实现方式：把类别位并入碰撞体的 membership（Rapier `collisionGroups` 高 16 位）。
 * 类别位从第 5 位起 —— 低位 1/2/4/8/16 已被默认组、碎片组、地形组、投掷物组、武器组占用；
 * 场景中其余碰撞体的 filter 只有 -1 / 1|2 / 1|4，均不含类别位，因此并入类别位不会新增任何碰撞对。
 * 类别位只服务查询侧识别，不参与交互：投掷物自身是 mask 0 的 sensor，命中判定走形状扫描（`castShape`）。
 *
 * 约定：新增碰撞体必须显式 `setCollisionGroups` 并标注类别（`categoryCollisionGroups`）。
 * 未声明碰撞组的碰撞体默认 membership 为全 1（含全部类别位），会被视为已标注类别（按声明顺序解析为 ground）——
 * 即 fail-closed：未知碰撞体阻挡投掷物，而非被投掷物忽略。
 */

/** 碰撞类别枚举值列表（顺序即多类别碰撞体的解析优先级） */
const COLLISION_CATEGORY_VALUES = ['ground', 'box', 'fragment', 'area', 'terrain', 'character'] as const
type CollisionCategory = typeof COLLISION_CATEGORY_VALUES[number]

/** 类别 → membership 位（第 5 位起，避开既有交互组） */
const COLLISION_CATEGORY_BIT: Record<CollisionCategory, number> = {
    ground: 1 << 5,
    box: 1 << 6,
    fragment: 1 << 7,
    area: 1 << 8,
    terrain: 1 << 9,
    character: 1 << 10,
}

/** 从 `collisionGroups` 取 membership（高 16 位） */
const membershipOf = (collisionGroups: number): number => (collisionGroups >>> 16) & 0xFFFF

/** 把类别位并入碰撞组 membership */
const withCollisionCategory = (membership: number, category: CollisionCategory): number =>
    membership | COLLISION_CATEGORY_BIT[category]

/** 打包「交互组（含类别位）+ 交互掩码」为 Rapier `collisionGroups`，供 `setCollisionGroups` 使用 */
const categoryCollisionGroups = (group: number, mask: number, category: CollisionCategory): number =>
    ((withCollisionCategory(group, category) & 0xFFFF) << 16) | (mask & 0xFFFF)

/** 把类别列表编译为位掩码（逐帧判定用，O(1)） */
const collisionCategoryMask = (categories: readonly CollisionCategory[]): number => {
    let mask = 0
    for (const category of categories) mask |= COLLISION_CATEGORY_BIT[category]
    return mask
}

/** 从 `collisionGroups` 解析类别（未标注类别的碰撞体返回 undefined；多类别按声明顺序取首个） */
const collisionCategoryOf = (collisionGroups: number): CollisionCategory | undefined => {
    const membership = membershipOf(collisionGroups)
    for (const category of COLLISION_CATEGORY_VALUES) {
        if ((membership & COLLISION_CATEGORY_BIT[category]) !== 0) return category
    }
    return undefined
}

/** 类别掩码是否包含指定类别 */
const maskIncludesCategory = (categoryMask: number, category: CollisionCategory): boolean =>
    (categoryMask & COLLISION_CATEGORY_BIT[category]) !== 0

/** `collisionGroups` 的类别位是否与类别掩码相交（用于「是否可穿过」判定） */
const matchesCategoryMask = (collisionGroups: number, categoryMask: number): boolean =>
    (membershipOf(collisionGroups) & categoryMask) !== 0

/** 全部类别位 —— 用于区分「已标注类别的场景几何」与「辅助碰撞体」（武器、其它投掷物） */
const ALL_CATEGORY_BITS = collisionCategoryMask(COLLISION_CATEGORY_VALUES)

/**
 * `collisionGroups` 是否为「可阻挡投掷物的场景几何」：
 * 必须已标注类别（排除武器、其它投掷物等辅助碰撞体），且解析出的类别不是角色
 * （角色命中使用宽容半径判定，见 `entity/character/combat/ranged_executor.ts`）。
 * 未显式声明碰撞组的碰撞体（membership 全 1）按声明顺序解析为 ground → 阻挡（fail-closed）。
 */
const isBlockingGeometry = (collisionGroups: number): boolean => {
    if ((membershipOf(collisionGroups) & ALL_CATEGORY_BITS) === 0) return false
    return collisionCategoryOf(collisionGroups) !== 'character'
}

export {
    COLLISION_CATEGORY_VALUES,
    COLLISION_CATEGORY_BIT,
    membershipOf,
    withCollisionCategory,
    categoryCollisionGroups,
    collisionCategoryMask,
    collisionCategoryOf,
    maskIncludesCategory,
    matchesCategoryMask,
    isBlockingGeometry,
}
export type {CollisionCategory}
