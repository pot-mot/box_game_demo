/** 编辑模式角色调试可视化分类（默认全部关闭） */
export const CHARACTER_DEBUG_VIEWS = ['collision', 'attack', 'hurt', 'detect', 'vision'] as const
export type CharacterDebugView = typeof CHARACTER_DEBUG_VIEWS[number]
