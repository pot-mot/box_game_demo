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

/** 级联编辑默认值：默认开启、层数取满覆盖深层自定义骨架（避免默认深度截断拉伸链条） */
export const DEFAULT_CASCADE_ENABLED = true
export const DEFAULT_CASCADE_DEPTH = 16

/** 级联层数输入上限 */
export const CASCADE_DEPTH_MAX = 16

/** 面板最大选中条目数保护（防构造异常数据） */
export const PANEL_MAX_JOINTS = 128
