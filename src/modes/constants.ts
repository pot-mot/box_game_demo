export const GAME_MODE_VALUES = ['edit', 'play'] as const
export type GameMode = typeof GAME_MODE_VALUES[number]
