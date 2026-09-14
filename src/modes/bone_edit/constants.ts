/** 时间轴面板初始高度（px） */
export const TIMELINE_HEIGHT = 240

/** 时间轴面板最小/最大高度（px，拖拽顶边调节） */
export const TIMELINE_MIN_HEIGHT = 120
export const TIMELINE_MAX_HEIGHT = 600

/** 时间轴缩放（px/秒）基准与范围（Ctrl+滚轮） */
export const TIMELINE_PX_PER_SEC = 120
export const TIMELINE_MIN_PX_PER_SEC = 20
export const TIMELINE_MAX_PX_PER_SEC = 800

/** 轨道行高（px） */
export const TRACK_ROW_HEIGHT = 22

/** 轨道列表宽度（px） */
export const TRACK_LIST_WIDTH = 220

/** 关键帧菱形标记尺寸（px） */
export const KEYFRAME_DIAMOND_SIZE = 9

/** 拖拽判定阈值（px）：位移小于该值视为点击 */
export const DRAG_CLICK_THRESHOLD = 4

/** 时间轴配色 */
export const TIMELINE_BG = '#1b1b22'
export const TIMELINE_GRID_LINE = '#2a2a33'
export const TIMELINE_PLAYHEAD = '#ffcc44'
export const TIMELINE_LABEL = '#aab'
export const KEYFRAME_COLOR = '#e8e8f0'
export const KEYFRAME_SELECTED_COLOR = '#ffcc44'
export const KEYFRAME_EVENT_COLOR = '#ff8866'

/** 洋葱皮：预览前后帧数量（每侧） */
export const ONION_SKIN_RANGE = 1

/** 洋葱皮帧间距（秒） */
export const ONION_SKIN_STEP = 0.1

/** 洋葱皮副本关节盒尺寸（米） */
export const ONION_SKIN_JOINT_SIZE = 0.015

/** 变换 Gizmo 缩放系数（根据相机距离调整视觉大小；关节尺寸较小，系数低于 edit 模式的 0.15） */
export const GIZMO_SCALE_FACTOR = 0.12

// ── 进入模式时的初始取景（把目标骨架居中于渲染视窗）──

/** 初始取景相机偏航（rad，0 = 从 +Z 正面看向角色脸部） */
export const VIEW_YAW = 0

/** 初始取景相机相对骨架中心的仰角（rad，正值 = 略高于视线、俯视角色） */
export const VIEW_ELEVATION = 0.15

/** 初始取景包围盒适配余量（>1 为四周留边；2.2 使角色约占可视高度六成，不顶到画布上沿） */
export const VIEW_FIT_MARGIN = 2.2

/** 初始取景最小观察距离（米，避免小骨架贴近穿模） */
export const VIEW_MIN_DISTANCE = 1.5

/** 初始取景可见区域高度比例下限（时间轴面板拉到最高时仍可用的取景高度） */
export const VIEW_MIN_VISIBLE_RATIO = 0.2