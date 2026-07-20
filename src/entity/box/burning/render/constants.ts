// ── 颜色渐变（白 → 黄 → 橙 → 红 → 黑）──
export const COLOR_WHITE = [1.0, 1.0, 1.0]
export const COLOR_YELLOW = [1.0, 1.0, 0.0]
export const COLOR_ORANGE = [1.0, 0.4, 0.0]
export const COLOR_RED = [0.8, 0.2, 0.0]
export const COLOR_DARK = [0.4, 0.0, 0.0]
export const COLOR_BLACK = [0.0, 0.0, 0.0]

/** 燃烧箱子边缘线颜色 */
export const EDGE_COLOR = 0x883333

// ── 粒子参数 ──
export const MAX_PARTICLES = 600
export const PARTICLE_SPAWN_RATE = 6          // 每帧每箱子基础生成数
export const PARTICLE_LIFETIME = 1.2          // 秒
export const PARTICLE_SPEED = 2.0
export const PARTICLE_SIZE_BASE = 0.15
export const PARTICLE_SIZE_MAX = 0.35
