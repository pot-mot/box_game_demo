import type {AttackModuleId} from '../weapon/attack_module.ts'
import type {BodyState} from './types.ts'

/** 体形状态中的当前攻击模组键（跨体形通用） */
export const ATTACK_MODULE_STATE_KEY = 'attackModule'

/** 读取当前攻击模组；缺失 / 非法值回退 fallback（存档容错） */
export const attackModuleOfBodyState = (state: BodyState | undefined, fallback: AttackModuleId): AttackModuleId =>
    state !== undefined && typeof state[ATTACK_MODULE_STATE_KEY] === 'string' && state[ATTACK_MODULE_STATE_KEY].length > 0
        ? state[ATTACK_MODULE_STATE_KEY]
        : fallback

/** 返回替换攻击模组后的新体形状态（保持其他键不变） */
export const withAttackModuleBodyState = (state: BodyState | undefined, moduleId: AttackModuleId): BodyState => ({
    ...state,
    [ATTACK_MODULE_STATE_KEY]: moduleId,
})

/** 移除体形状态中的攻击模组键（切体形 / 非武器槽体形使用） */
export const withoutAttackModuleBodyState = (state: BodyState | undefined): BodyState => {
    if (state === undefined) return {}
    const next: Record<string, string> = {...state}
    delete next[ATTACK_MODULE_STATE_KEY]
    return next
}
