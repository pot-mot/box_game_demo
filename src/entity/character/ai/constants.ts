/** 视线检测扇形总张角：身体前方 270°（正后方 90° 为视野盲区） */
export const VISION_FAN_ANGLE = Math.PI * 1.5
/** 视线扇形半角（朝向两侧各 135°） */
export const VISION_FAN_HALF_ANGLE = VISION_FAN_ANGLE / 2
/** 扇形扫描射线步长：每 10° 一条 */
export const VISION_FAN_RAY_STEP = Math.PI / 18
/** 扇形扫描射线数：270° / 10° + 1 = 28（含左右边界射线） */
export const VISION_FAN_RAY_COUNT = Math.floor(VISION_FAN_ANGLE / VISION_FAN_RAY_STEP) + 1
