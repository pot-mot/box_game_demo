import type {DeepReadonly} from '../types/readonly.ts'
import type {StringLocaleKey} from '../i18n/index.ts'

/** 所有可重绑的输入动作 */
export const INPUT_ACTIONS = [
    'move_forward',
    'move_backward',
    'move_left',
    'move_right',
    'move_up',
    'move_down',
    'jump',
    /* 移动技能（翻滚）：动作 id 保留 sprint 以兼容既有键位存档 */
    'sprint',
    /* 近战持握模式切换（单持 → 双手共持 → 双持循环；副手同类近战才含双持） */
    'cycle_hold_mode',
    'cycle_spawn_up',
    'cycle_spawn_down',
    'delete_entity',
    'close_panel',
    /* 交互：对最近的可交互物执行一次交互动作 */
    'interact',
    /* 箱庭子系统开关 */
    'open_inventory',
    'open_equipment',
    'open_map',
    'save_world',
    'load_world',
    'mouse_orbit',
    'mouse_pan',
    'spawn_entity',
    'lock_target',
] as const

export type InputAction = typeof INPUT_ACTIONS[number]

/** 键组合：一组必须同时按下的键码（键盘 KeyboardEvent.code 或鼠标按键码），已排序 */
export type KeyCombo = readonly string[]

/** 动作到键组合列表的映射 */
export type BindingsMap = Record<InputAction, KeyCombo[]>

/** 每个动作的本地化标签键 */
export const ACTION_LABELS: Record<InputAction, StringLocaleKey> = {
    move_forward: 'input.action.move_forward',
    move_backward: 'input.action.move_backward',
    move_left: 'input.action.move_left',
    move_right: 'input.action.move_right',
    move_up: 'input.action.move_up',
    move_down: 'input.action.move_down',
    jump: 'input.action.jump',
    sprint: 'input.action.sprint',
    cycle_hold_mode: 'input.action.cycle_hold_mode',
    cycle_spawn_up: 'input.action.cycle_spawn_up',
    cycle_spawn_down: 'input.action.cycle_spawn_down',
    delete_entity: 'input.action.delete_entity',
    close_panel: 'input.action.close_panel',
    interact: 'input.action.interact',
    open_inventory: 'input.action.open_inventory',
    open_equipment: 'input.action.open_equipment',
    open_map: 'input.action.open_map',
    save_world: 'input.action.save_world',
    load_world: 'input.action.load_world',
    mouse_orbit: 'input.action.mouse_orbit',
    mouse_pan: 'input.action.mouse_pan',
    spawn_entity: 'input.action.spawn_entity',
    lock_target: 'input.action.lock_target',
}

/** 动作分组 */
export const ACTION_GROUPS: readonly { readonly name: StringLocaleKey; readonly actions: readonly InputAction[] }[] = [
    {name: 'input.group.move', actions: ['move_forward', 'move_backward', 'move_left', 'move_right', 'move_up', 'move_down']},
    {name: 'input.group.character', actions: ['jump', 'sprint', 'cycle_hold_mode', 'interact']},
    {name: 'input.group.edit_tools', actions: ['cycle_spawn_up', 'cycle_spawn_down']},
    {name: 'input.group.ui', actions: ['delete_entity', 'close_panel', 'open_inventory', 'open_equipment', 'open_map']},
    {name: 'input.group.system', actions: ['save_world', 'load_world']},
]

/** 不可修改的鼠标操作展示项 */
export interface FixedMouseOperation {
    /** 键位列显示的固定文本（如“滚轮”“拖拽关节”） */
    readonly keys: StringLocaleKey
    /** 操作名称 */
    readonly label: StringLocaleKey
}

/** 固定鼠标操作表覆盖的模式（与 modes 的 GAME_MODE_VALUES 保持一致，新增模式时此处会编译报错） */
export const MOUSE_OPERATION_MODES = ['edit', 'play', 'showcase', 'bone_edit'] as const
export type MouseOperationsMode = typeof MOUSE_OPERATION_MODES[number]

/**
 * 各模式下绑定到指针的**可修改**动作（在操作设置面板的“鼠标”分组中列出）。
 * 同一动作在不同模式下的含义不同（如右键在编辑模式生成物体、在展示模式平移视角），故按模式列出。
 */
export const MOUSE_ACTIONS_BY_MODE: Record<MouseOperationsMode, readonly InputAction[]> = {
    edit: ['mouse_orbit', 'spawn_entity'],
    play: ['mouse_orbit', 'lock_target'],
    showcase: ['mouse_orbit', 'mouse_pan'],
    bone_edit: ['mouse_orbit'],
}

/** 各模式下不可修改的鼠标操作（操作说明面板移除后，这部分信息在操作设置面板中保留） */
export const FIXED_MOUSE_OPERATIONS: Record<MouseOperationsMode, readonly FixedMouseOperation[]> = {
    edit: [
        {keys: 'input.fixed.key.click_left', label: 'input.fixed.label.edit_select'},
        {keys: 'input.fixed.key.wheel', label: 'input.fixed.label.edit_sculpt'},
    ],
    play: [
        {keys: 'input.fixed.key.release_left', label: 'input.fixed.label.play_light'},
        {keys: 'input.fixed.key.release_right', label: 'input.fixed.label.play_heavy'},
        {keys: 'input.fixed.key.wheel', label: 'input.fixed.label.zoom_camera'},
    ],
    showcase: [
        {keys: 'input.fixed.key.click_left', label: 'input.fixed.label.showcase_focus'},
        {keys: 'input.fixed.key.wheel', label: 'input.fixed.label.zoom_camera'},
    ],
    bone_edit: [
        {keys: 'input.fixed.key.click_left', label: 'input.fixed.label.bone_select'},
        {keys: 'input.fixed.key.drag_joint', label: 'input.fixed.label.bone_move_ik'},
        {keys: 'input.fixed.key.drag_bone', label: 'input.fixed.label.bone_rotate_tail'},
        {keys: 'input.fixed.key.dbl_timeline', label: 'input.fixed.label.bone_add_key'},
        {keys: 'input.fixed.key.ctrl_wheel', label: 'input.fixed.label.bone_zoom_timeline'},
    ],
}

/** 输入注册表公开接口 */
export interface InputRegistry {
    readonly isActionActive: (action: InputAction) => boolean
    readonly wasActionPressed: (action: InputAction) => boolean
    readonly onActionDown: (action: InputAction, callback: () => void) => void
    readonly setInputCapture: (handler: ((combo: KeyCombo) => void) | undefined) => void
    /** 鼠标按键是否命中该动作的绑定（组合中的其它键需处于按下状态） */
    readonly matchesMouseButton: (action: InputAction, button: number) => boolean
    readonly getBindings: () => DeepReadonly<BindingsMap>
    readonly setBindings: (map: BindingsMap) => void
    readonly resetToDefaults: () => void
    readonly saveToStorage: () => void
    readonly loadFromStorage: () => void
    readonly getUpdater: () => () => void
    readonly destroy: () => void
}
