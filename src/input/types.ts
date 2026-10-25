import type {DeepReadonly} from '../types/readonly.ts'
import type {StringLocaleKey} from '../i18n/index.ts'
import type {GameMode} from '../modes/constants.ts'

/** 所有可重绑的输入动作 */
export const INPUT_ACTIONS = [
    'move_forward',
    'move_backward',
    'move_left',
    'move_right',
    'move_up',
    'move_down',
    'jump',
    /* 玩家主控：翻滚（边沿触发） */
    'roll',
    /* 纯摄像机：自由飞行加速（按住） */
    'boost',
    /* 近战持握模式切换（单持 → 双手共持 → 双持循环；副手同类近战才含双持） */
    'cycle_attack_module',
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
    /* 游玩模式调试 HUD 显隐（默认 ~） */
    'toggle_debug_hud',
    'mouse_orbit',
    'mouse_pan',
    'spawn_entity',
    'lock_target',
    /* 游玩模式攻击：轻击（默认左键松开）/ 重击（默认右键松开），可重绑 */
    'attack_light',
    'attack_heavy',
    /* 展示模式聚焦（默认左键点击），可重绑 */
    'showcase_focus',
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
    roll: 'input.action.roll',
    boost: 'input.action.boost',
    cycle_attack_module: 'input.action.cycle_attack_module',
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
    toggle_debug_hud: 'input.action.toggle_debug_hud',
    mouse_orbit: 'input.action.mouse_orbit',
    mouse_pan: 'input.action.mouse_pan',
    spawn_entity: 'input.action.spawn_entity',
    lock_target: 'input.action.lock_target',
    attack_light: 'input.action.attack_light',
    attack_heavy: 'input.action.attack_heavy',
    showcase_focus: 'input.action.showcase_focus',
}

/** 动作分组 */
export const ACTION_GROUPS: readonly { readonly name: StringLocaleKey; readonly actions: readonly InputAction[] }[] = [
    {name: 'input.group.move', actions: ['move_forward', 'move_backward', 'move_left', 'move_right', 'move_up', 'move_down', 'boost']},
    {name: 'input.group.character', actions: ['jump', 'roll', 'cycle_attack_module', 'interact']},
    {name: 'input.group.edit_tools', actions: ['cycle_spawn_up', 'cycle_spawn_down']},
    {name: 'input.group.ui', actions: ['delete_entity', 'close_panel', 'open_inventory', 'open_equipment', 'open_map']},
    {name: 'input.group.system', actions: ['save_world', 'load_world', 'toggle_debug_hud']},
]

/** 不可修改的鼠标操作展示项 */
export interface FixedMouseOperation {
    /** 键位列显示的固定文本（如“滚轮”“拖拽关节”） */
    readonly keys: StringLocaleKey
    /** 操作名称 */
    readonly label: StringLocaleKey
}

/** 固定鼠标操作表覆盖的模式（与 modes 的 GAME_MODE_VALUES 保持一致，新增模式时此处会编译报错） */
export const MOUSE_OPERATION_MODES = ['edit', 'play', 'showcase', 'bone_edit'] as const satisfies readonly GameMode[]
export type MouseOperationsMode = typeof MOUSE_OPERATION_MODES[number]

/**
 * 各模式下绑定到指针的**可修改**动作（在操作设置面板的“鼠标”分组中列出）。
 * 同一动作在不同模式下的含义不同（如右键在展示模式平移视角、Ctrl+左键在编辑模式生成物体），故按模式列出。
 */
export const MOUSE_ACTIONS_BY_MODE: Record<MouseOperationsMode, readonly InputAction[]> = {
    edit: ['mouse_orbit', 'mouse_pan', 'spawn_entity'],
    play: ['mouse_orbit', 'attack_light', 'attack_heavy', 'lock_target'],
    showcase: ['mouse_orbit', 'mouse_pan', 'showcase_focus'],
    bone_edit: ['mouse_orbit', 'mouse_pan'],
}

/** 各模式下不可修改的鼠标操作（操作说明面板移除后，这部分信息在操作设置面板中保留） */
export const FIXED_MOUSE_OPERATIONS: Record<MouseOperationsMode, readonly FixedMouseOperation[]> = {
    edit: [
        {keys: 'input.fixed.key.click_left', label: 'input.fixed.label.edit_select'},
        {keys: 'input.fixed.key.wheel', label: 'input.fixed.label.zoom_camera'},
    ],
    play: [
        {keys: 'input.fixed.key.wheel', label: 'input.fixed.label.zoom_camera'},
    ],
    showcase: [
        {keys: 'input.fixed.key.wheel', label: 'input.fixed.label.zoom_camera'},
    ],
    bone_edit: [
        {keys: 'input.fixed.key.click_left', label: 'input.fixed.label.bone_select'},
        {keys: 'input.fixed.key.drag_gizmo', label: 'input.fixed.label.bone_transform_gizmo'},
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
    /**
     * 该鼠标按键是否被「更长组合」的绑定动作覆盖（组合中的修饰键需处于按下状态）。
     * `baseAction` = 该按键上基础行为自身的动作（取其匹配组合长度作为基准）；省略时基准为普通单击（长度 1）。
     * 当 `actions` 中某动作（≠ baseAction）匹配该按键、且组合长度大于基准时返回 true。
     * 供基础指针行为（选中 / 旋转 / 攻击 / 聚焦）让位给「修饰键+鼠标」的绑定动作。
     */
    readonly isMouseButtonOverridden: (
        button: number,
        actions: readonly InputAction[],
        baseAction?: InputAction,
    ) => boolean
    readonly getBindings: () => DeepReadonly<BindingsMap>
    readonly setBindings: (map: BindingsMap) => void
    readonly resetToDefaults: () => void
    readonly saveToStorage: () => void
    readonly loadFromStorage: () => void
    readonly getUpdater: () => () => void
    readonly destroy: () => void
}
