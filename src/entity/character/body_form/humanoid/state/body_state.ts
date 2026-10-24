import type {BodyState} from '../../../../../character/types.ts'
import type {Handedness} from '../../../../../character/handedness.ts'
import {DEFAULT_HANDEDNESS, isHandedness} from '../../../../../character/handedness.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import {isHoldMode} from '../../../../../character/weapon/hold_mode.ts'

/**
 * 人形体形状态：持握模式与惯用手属于**人类体形**，不放在通用 `CharacterConfig` 顶层。
 * 通用层只把它当作不透明 `BodyState` 持久化；只有人形动画 / 外观系统解释这两个键。
 */
export interface HumanoidBodyState extends BodyState {
    readonly holdMode: HoldMode
    readonly handedness: Handedness
}

const DEFAULT_HOLD_MODE: HoldMode = 'one_handed'

/** 读取人形状态；缺失 / 非法值安全回退默认（右撇子、单持） */
export const humanoidBodyStateOf = (state: BodyState | undefined): HumanoidBodyState => ({
    holdMode: state !== undefined && isHoldMode(state.holdMode) ? state.holdMode : DEFAULT_HOLD_MODE,
    handedness: state !== undefined && isHandedness(state.handedness) ? state.handedness : DEFAULT_HANDEDNESS,
})

/** 返回替换持握模式后的新状态（保持其他体形键不变） */
export const withHumanoidHoldMode = (state: BodyState | undefined, holdMode: HoldMode): BodyState => ({
    ...state,
    holdMode,
})

/** 返回替换惯用手后的新状态（保持其他体形键不变） */
export const withHumanoidHandedness = (state: BodyState | undefined, handedness: Handedness): BodyState => ({
    ...state,
    handedness,
})

/** 人形初始状态（新建角色 / 存档缺字段） */
export const defaultHumanoidBodyState = (): BodyState => ({
    holdMode: DEFAULT_HOLD_MODE,
    handedness: DEFAULT_HANDEDNESS,
})
