import type {BreathKind, RangedWeaponConfig} from './ranged_weapon.ts'

/** 龙吐息模组（独立装备槽；不是主武器条目） */
export interface BreathModuleConfig extends RangedWeaponConfig {
    readonly breathKind: BreathKind
    /** 对应背包物品 id */
    readonly itemId: string
}

const MODULES = new Map<string, BreathModuleConfig>()

/** 注册吐息模组（体形装配时调用） */
export const registerBreathModules = (modules: readonly BreathModuleConfig[]): void => {
    for (const module of modules) MODULES.set(module.id, module)
}

/** 按 id 查吐息模组 */
export const breathModuleOf = (id: string | undefined): BreathModuleConfig | undefined =>
    id !== undefined ? MODULES.get(id) : undefined

/** 全部吐息模组 */
export const allBreathModules = (): readonly BreathModuleConfig[] => [...MODULES.values()]

export const breathModuleDisplayName = (module: BreathModuleConfig): string => module.name
