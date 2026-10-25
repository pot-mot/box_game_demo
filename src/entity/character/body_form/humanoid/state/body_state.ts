import type {BodyState} from '../../../../../character/types.ts'
import type {Handedness} from '../../../../../character/handedness.ts'
import {DEFAULT_HANDEDNESS, isHandedness} from '../../../../../character/handedness.ts'

/**
 * 人形体形状态：惯用手属于**人类体形**；攻击模组是跨体形通用键（见 `state/attack_module_state.ts`）。
 * 通用层只把 `bodyState` 当作不透明键值持久化；只有人形动画 / 外观系统解释 `handedness`。
 */
export interface HumanoidBodyState extends BodyState {
    readonly handedness: Handedness
}

/** 读取人形惯用手；缺失 / 非法值安全回退默认（右撇子） */
export const humanoidBodyStateOf = (state: BodyState | undefined): HumanoidBodyState => ({
    handedness: state !== undefined && isHandedness(state.handedness) ? state.handedness : DEFAULT_HANDEDNESS,
})

/** 返回替换惯用手后的新状态（保持其他体形键不变） */
export const withHumanoidHandedness = (state: BodyState | undefined, handedness: Handedness): BodyState => ({
    ...state,
    handedness,
})

/** 人形初始状态（新建角色 / 存档缺字段） */
export const defaultHumanoidBodyState = (): BodyState => ({
    handedness: DEFAULT_HANDEDNESS,
})
