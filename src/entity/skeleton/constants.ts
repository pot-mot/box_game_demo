/** 关节小球半径（米） */
export const JOINT_GIZMO_RADIUS = 0.03

/** 关节小球默认颜色 */
export const JOINT_GIZMO_COLOR = 0x4a9eff

/** 关节小球选中颜色 */
export const JOINT_GIZMO_SELECTED_COLOR = 0xffcc44

/** 骨骼段菱形默认颜色 */
export const BONE_DIAMOND_COLOR = 0x9a7bff

/** 骨骼段菱形选中颜色 */
export const BONE_DIAMOND_SELECTED_COLOR = 0xffcc44

/** 骨骼段菱形最小可见长度（米，小于该值隐藏，避免退化段显示为点） */
export const BONE_DIAMOND_MIN_LENGTH = 0.005

/** 预设骨架调色板（默认第 0 套角色配色，仅供备用外观装载） */
export const PRESET_PALETTE = {skinColor: 0xf0c8a0, hairColor: 0x3a2218, bodyColor: 0xe06040, legColor: 0x303050} as const

/** 面板最大选中条目数保护（防构造异常数据） */
export const PANEL_MAX_JOINTS = 128