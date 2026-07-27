export const GAME_MODE_VALUES = ['edit', 'play'] as const
export type GameMode = typeof GAME_MODE_VALUES[number]

/** 鼠标拖拽旋转灵敏度（edit 和 play 模式共用） */
export const ORBIT_SENSITIVITY = 0.002
/** WASD 自由飞行相机每帧移动步长（edit 和 play 模式共用） */
export const MOVE_STEP = 0.04

