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
    'save_world',
    'load_world',
    'mouse_orbit',
    'mouse_pan',
    'spawn_entity',
] as const

export type InputAction = typeof INPUT_ACTIONS[number]

/** 键组合：一组必须同时按下的键码（键盘 KeyboardEvent.code 或鼠标按键码），已排序 */
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
    save_world: '导出存档',
    load_world: '导入存档',
    mouse_orbit: '旋转视角',
    mouse_pan: '平移视角',
    spawn_entity: '生成物体',
}

/** 动作分组 */
export const ACTION_GROUPS: readonly { readonly name: string; readonly actions: readonly InputAction[] }[] = [
    {name: '移动', actions: ['move_forward', 'move_backward', 'move_left', 'move_right', 'move_up', 'move_down']},
    {name: '角色', actions: ['jump', 'sprint']},
    {name: '编辑工具', actions: ['cycle_spawn_up', 'cycle_spawn_down']},
    {name: 'UI', actions: ['delete_entity', 'close_panel']},
    {name: '系统', actions: ['save_world', 'load_world']},
]

/** 不可修改的鼠标操作展示项 */
export interface FixedMouseOperation {
    /** 键位列显示的固定文本（如“滚轮”“拖拽关节”） */
    readonly keys: string
    /** 操作名称 */
    readonly label: string
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
    play: ['mouse_orbit'],
    showcase: ['mouse_orbit', 'mouse_pan'],
    bone_edit: ['mouse_orbit'],
}

/** 各模式下不可修改的鼠标操作（操作说明面板移除后，这部分信息在操作设置面板中保留） */
export const FIXED_MOUSE_OPERATIONS: Record<MouseOperationsMode, readonly FixedMouseOperation[]> = {
    edit: [
        {keys: '左键点击', label: '选中物体'},
        {keys: '滚轮', label: '雕刻地形'},
    ],
    play: [
        {keys: '左键松开', label: '轻攻击'},
        {keys: '右键松开', label: '重攻击'},
        {keys: '滚轮', label: '视角缩放'},
    ],
    showcase: [
        {keys: '左键点击', label: '聚焦角色'},
        {keys: '滚轮', label: '视角缩放'},
    ],
    bone_edit: [
        {keys: '左键点击', label: '选中关节 / 骨骼'},
        {keys: '拖拽关节', label: '移动（IK 模式牵引）'},
        {keys: '拖拽骨骼段', label: '旋转 tail 子树'},
        {keys: '双击时间轴', label: '添加关键帧'},
        {keys: 'Ctrl + 滚轮', label: '时间轴缩放'},
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
