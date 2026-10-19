// ── 纯摄像机 / 玩家主控 共用的相机常量 ──

/** 纯摄像机默认观察目标（轨道相机的初始目标点） */
export const CAMERA_ORBIT_DEFAULT_TARGET_Y = 0.7
export const CAMERA_ORBIT_DEFAULT_TARGET_Z = -4.6

/** 纯摄像机默认球坐标（偏航 / 俯仰 / 距离） */
export const CAMERA_ORBIT_DEFAULT_YAW = 0
export const CAMERA_ORBIT_DEFAULT_PITCH = 0.46
export const CAMERA_ORBIT_DEFAULT_DISTANCE = 17

/** 纯摄像机距离 / 俯仰范围 */
export const CAMERA_ORBIT_MIN_DISTANCE = 1.5
export const CAMERA_ORBIT_MAX_DISTANCE = 45
export const CAMERA_ORBIT_PITCH_MIN = 0.05
export const CAMERA_ORBIT_PITCH_MAX = 1.45

/** 未聚焦自由旋转的俯仰角范围（对标第一人称，可上下自由环视，留 0.01rad 防万向锁） */
export const CAMERA_FREE_PITCH_MIN = -Math.PI / 2 + 0.01
export const CAMERA_FREE_PITCH_MAX = Math.PI / 2 - 0.01

/** 旋转灵敏度（rad / px） */
export const CAMERA_ORBIT_ROTATE_SENSITIVITY = 0.005
/** 平移灵敏度（距离比例 / px） */
export const CAMERA_ORBIT_PAN_SENSITIVITY = 0.0016
/** 滚轮缩放指数系数（越小越慢；距离按比例缩放，缩小视角时同样平缓） */
export const CAMERA_ORBIT_WHEEL_SENSITIVITY = 1 / 3000
/** 滚轮缩放平滑速率（1/s）：渲染距离逐帧逼近目标距离，消除滚轮跳变 */
export const CAMERA_ZOOM_SMOOTH_FACTOR = 14
/** 聚焦时的观察距离 */
export const CAMERA_ORBIT_FOCUS_DISTANCE = 3.6
/** 聚焦 / 回归 / 跟随过渡速率（1/s，越大越快） */
export const CAMERA_ORBIT_FOCUS_LERP = 6

/** 纯摄像机自由飞行加速倍率（按住 boost 动作时叠加到每帧步长） */
export const FREE_FLIGHT_BOOST_MULTIPLIER = 3

// ── 玩家主控相机常量 ──

/** 玩家第三人称相机默认球坐标（偏航 / 俯仰 / 距离） */
export const PLAYER_CAMERA_DEFAULT_YAW = Math.PI
export const PLAYER_CAMERA_DEFAULT_PITCH = Math.PI / 6
export const PLAYER_CAMERA_DEFAULT_DISTANCE = 6

/** 玩家相机缩放指数系数（越小越慢；距离按比例缩放，缩小视角时同样平缓） */
export const PLAYER_CAMERA_WHEEL_SENSITIVITY = 1 / 3000
/** 玩家相机缩放平滑速率（1/s）：渲染距离逐帧逼近目标距离，消除滚轮跳变 */
export const PLAYER_CAMERA_ZOOM_SMOOTH_FACTOR = 14
/** 玩家相机距离范围 */
export const PLAYER_CAMERA_MIN_DISTANCE = 1
export const PLAYER_CAMERA_MAX_DISTANCE = 30

/** 取消聚焦后回到玩家跟随的最长过渡时间（秒）：玩家持续移动时也保证过渡结束 */
export const PLAYER_CAMERA_RETURN_MAX_TIME = 1.5

/** 锁定后相机转向目标的角速度系数（1/s，同 EMA 形式） */
export const LOCK_ON_TURN_FACTOR = 10
/** 锁定/取消锁定时视点在玩家与目标之间混合的速率（1/s，同 EMA 形式） */
export const LOCK_ON_BLEND_FACTOR = 8

/** 判定为「点击」的最大拖拽位移（px，超过视为拖拽旋转视角，不触发攻击 / 不解除锁定） */
export const PLAYER_CLICK_DRAG_THRESHOLD = 5
