/** 视线检测扇形总张角：身体前方 270°（正后方 90° 为视野盲区） */
export const VISION_FAN_ANGLE = Math.PI * 1.5
/** 视线扇形半角（朝向两侧各 135°） */
export const VISION_FAN_HALF_ANGLE = VISION_FAN_ANGLE / 2
/** 扇形扫描射线步长：每 10° 一条 */
export const VISION_FAN_RAY_STEP = Math.PI / 18
/** 扇形扫描射线数：270° / 10° + 1 = 28（含左右边界射线） */
export const VISION_FAN_RAY_COUNT = Math.floor(VISION_FAN_ANGLE / VISION_FAN_RAY_STEP) + 1

/* ── 静止检测（卡死自愈） ── */
/** 有移动意图的最小输入模长（与动作层 walking 守卫阈值一致） */
export const STALL_INPUT_EPS = 0.001
/** 检测窗口内水平位移超过该值（m）即视为"在动"，刷新锚点与计时 */
export const STALL_CHECK_TRAVEL = 0.5
/** 持续有移动意图但无位移超过该时长（秒）→ 触发卡死恢复 */
export const STALL_TIMEOUT = 2.0
/** 战斗卡死强制放弃后的重新接敌冷却（秒），防止超时→peace→立即回 chase 的空转循环 */
export const COMBAT_REENTRY_COOLDOWN = 3.0
/** 追击活动半径（m）：距出生点超过该值时放弃追击，防止同速目标把角色拖向无限远 */
export const CHASE_LEASH_RADIUS = 20
/** combat 卡死横向绕行重试的最大次数：达到后仍卡死才放弃战斗 */
export const COMBAT_STALL_MAX_RETRIES = 3
/** combat 卡死重试的绕行时长（秒）：偏转方向侧向移动，打破贴脸顶牛/正面被堵 */
export const COMBAT_STALL_DETOUR_DURATION = 1.0
/** 脱战距离滞回系数：放弃战斗的距离阈值 = detectionRange × 系数（进入用 detectionRange），
 * 防止边界抖动/受击仇恨目标超距时 combat 一闪即灭 */
export const COMBAT_LOSE_RANGE_FACTOR = 2
