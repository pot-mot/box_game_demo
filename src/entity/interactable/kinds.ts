import {ATTACK_SOURCE_KINDS, type AttackSourceKind} from '../../character/combat/world_targets.ts'

/** 交互物类型 */
export const INTERACTABLE_KINDS = [    'save_point',
    'teleport',
    'switch',
    'push_door_single',
    'push_door_double',
    'gate',
    'chest',
    'elevator',
    'breakable',
] as const

export type InteractableKind = typeof INTERACTABLE_KINDS[number]

/** 中文标签（面板 / 列表） */
export const INTERACTABLE_LABELS: Record<InteractableKind, string> = {
    save_point: '存档点',
    teleport: '传送点',
    switch: '开关',
    push_door_single: '单推门',
    push_door_double: '双推门',
    gate: '升降闸门',
    chest: '箱子',
    elevator: '升降梯',
    breakable: '可破坏道具',
}

export const isInteractableKind = (value: string): value is InteractableKind =>
    (INTERACTABLE_KINDS as readonly string[]).includes(value)

/** 可破坏道具的伤害来源类别（与战斗侧攻击来源类别同源） */
export const BREAKABLE_SOURCES = ATTACK_SOURCE_KINDS
export type BreakableSource = AttackSourceKind

export const BREAKABLE_SOURCE_LABELS: Record<BreakableSource, string> = {
    melee: '近战',
    ranged: '远程',
    explosion: '爆炸',
    roll: '翻滚',
}

export const isBreakableSource = (value: string): value is BreakableSource =>
    (BREAKABLE_SOURCES as readonly string[]).includes(value)
