/** 关节小球半径（米）：直径与骨骼段菱形厚度同量级（0.05），避免骨骼层糊住模型 */
export const JOINT_GIZMO_RADIUS = 0.025

/** 关节小球默认颜色 */
export const JOINT_GIZMO_COLOR = 0x4a9eff

/** 关节小球选中颜色 */
export const JOINT_GIZMO_SELECTED_COLOR = 0xffcc44

/** 骨骼段菱形默认颜色 */
export const BONE_DIAMOND_COLOR = 0x9a7bff

/** 骨骼段菱形选中颜色 */
export const BONE_DIAMOND_SELECTED_COLOR = 0xffcc44

/** 骨骼段菱形厚度（x/z 缩放，米；OctahedronGeometry 基准半径 0.5，细长连接段） */
export const BONE_DIAMOND_THICKNESS = 0.05

/** 骨骼段菱形最小可见长度（米，小于该值隐藏，避免退化段显示为点） */
export const BONE_DIAMOND_MIN_LENGTH = 0.005

/** 旋转指针（方向三角形）半径（米，小于关节小球半径避免遮挡小球正面拾取） */
export const ROTATION_GIZMO_RADIUS = 0.015

/** 旋转指针（方向三角形）高度（米，圆锥尖指向局部 +Z） */
export const ROTATION_GIZMO_HEIGHT = 0.1

/** 旋转指针沿局部 +Z 的偏移（米，露出关节小球） */
export const ROTATION_GIZMO_OFFSET = 0.035

/** 旋转指针颜色 */
export const ROTATION_GIZMO_COLOR = 0xffa020

/** 级联编辑默认值：默认开启、层数取满覆盖深层自定义骨架（避免默认深度截断拉伸链条） */
export const DEFAULT_CASCADE_ENABLED = true
export const DEFAULT_CASCADE_DEPTH = 16

/** 级联层数输入上限 */
export const CASCADE_DEPTH_MAX = 16

/** 预设骨架调色板（默认第 0 套角色配色，外观部件装载用） */
export const PRESET_PALETTE = {skinColor: 0xf0c8a0, hairColor: 0x3a2218, bodyColor: 0xe06040, legColor: 0x303050} as const

/** 面板最大选中条目数保护（防构造异常数据） */
export const PANEL_MAX_JOINTS = 128
