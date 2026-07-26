export const GAME_MODE_VALUES = ['edit', 'play'] as const
export type GameMode = typeof GAME_MODE_VALUES[number]

/** 鼠标拖拽旋转灵敏度（edit 和 play 模式共用） */
export const ORBIT_SENSITIVITY = 0.002

