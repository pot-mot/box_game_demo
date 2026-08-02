import type {DeepReadonly} from '../types/readonly.ts'

/** 所有可重绑的输入动作 */
export const INPUT_ACTIONS = [
    'move_forward',
    'move_backward',
    'move_left',
    'move_right',
    'move_up',
    'move_down',
    'jump',
    'sprint',
    'cycle_spawn_up',
    'cycle_spawn_down',
    'delete_entity',
    'close_panel',
    'toggle_help',
    'save_world',
    'load_world',
] as const

export type InputAction = typeof INPUT_ACTIONS[number]

/** 键组合：一组必须同时按下的键码，已排序 */
export type KeyCombo = readonly string[]

/** 动作到键组合列表的映射 */
export type BindingsMap = Record<InputAction, KeyCombo[]>

/** 每个动作的中文标签 */
export const ACTION_LABELS: Record<InputAction, string> = {
    move_forward: '向前移动',
    move_backward: '向后移动',
    move_left: '向左移动',
    move_right: '向右移动',
    move_up: '上升',
    move_down: '下降',
    jump: '跳跃',
    sprint: '冲刺',
    cycle_spawn_up: '上一个生成类型',
    cycle_spawn_down: '下一个生成类型',
    delete_entity: '删除实体',
    close_panel: '关闭面板',
    toggle_help: '操作说明',
    save_world: '导出存档',
    load_world: '导入存档',
}

/** 动作分组 */
export const ACTION_GROUPS: readonly { readonly name: string; readonly actions: readonly InputAction[] }[] = [
    {name: '移动', actions: ['move_forward', 'move_backward', 'move_left', 'move_right', 'move_up', 'move_down']},
    {name: '角色', actions: ['jump', 'sprint']},
    {name: '编辑工具', actions: ['cycle_spawn_up', 'cycle_spawn_down']},
    {name: 'UI', actions: ['delete_entity', 'close_panel', 'toggle_help']},
    {name: '系统', actions: ['save_world', 'load_world']},
]

/** 仅编辑模式下显示在操作说明中的动作 */
export const EDIT_ONLY_ACTIONS: ReadonlySet<InputAction> = new Set([
    'cycle_spawn_up',
    'cycle_spawn_down',
    'delete_entity',
    'close_panel',
])

/** 输入注册表公开接口 */
export interface InputRegistry {
    readonly isActionActive: (action: InputAction) => boolean
    readonly wasActionPressed: (action: InputAction) => boolean
    readonly onActionDown: (action: InputAction, callback: () => void) => void
    readonly setKeyCapture: (handler: ((combo: KeyCombo) => void) | undefined) => void
    readonly getBindings: () => DeepReadonly<BindingsMap>
    readonly setBindings: (map: BindingsMap) => void
    readonly resetToDefaults: () => void
    readonly saveToStorage: () => void
    readonly loadFromStorage: () => void
    readonly getUpdater: () => () => void
    readonly destroy: () => void
}
