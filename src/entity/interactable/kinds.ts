import {ATTACK_SOURCE_KINDS, type AttackSourceKind} from '../../character/combat/world_targets.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'

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

/** 本地化标签键（面板 / 列表） */
export const INTERACTABLE_LABELS: Record<InteractableKind, StringLocaleKey> = {
    save_point: 'interactable.save_point',
    teleport: 'interactable.teleport',
    switch: 'interactable.switch',
    push_door_single: 'interactable.push_door_single',
    push_door_double: 'interactable.push_door_double',
    gate: 'interactable.gate',
    chest: 'interactable.chest',
    elevator: 'interactable.elevator',
    breakable: 'interactable.breakable',
}

export const isInteractableKind = (value: string): value is InteractableKind =>
    (INTERACTABLE_KINDS as readonly string[]).includes(value)

/** 可破坏道具的伤害来源类别（与战斗侧攻击来源类别同源） */
export const BREAKABLE_SOURCES = ATTACK_SOURCE_KINDS
export type BreakableSource = AttackSourceKind

export const BREAKABLE_SOURCE_LABELS: Record<BreakableSource, StringLocaleKey> = {
    melee: 'breakable_source.melee',
    ranged: 'breakable_source.ranged',
    explosion: 'breakable_source.explosion',
    roll: 'breakable_source.roll',
}

export const isBreakableSource = (value: string): value is BreakableSource =>
    (BREAKABLE_SOURCES as readonly string[]).includes(value)
