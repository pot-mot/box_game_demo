/** 关节 gizmo 尺寸（立方体边长，米） */
export const JOINT_GIZMO_SIZE = 0.02

/** 关节 gizmo 默认颜色 */
export const JOINT_GIZMO_COLOR = 0x4a9eff

/** 关节 gizmo 选中颜色 */
export const JOINT_GIZMO_SELECTED_COLOR = 0xffcc44

/** 预设骨架调色板（默认第 0 套角色配色） */
export const PRESET_PALETTE = {skinColor: 0xf0c8a0, hairColor: 0x3a2218, bodyColor: 0xe06040, legColor: 0x303050} as const

/** 面板最大选中条目数保护（防构造异常数据） */
export const PANEL_MAX_JOINTS = 128