import type {SurfaceMaterialId} from '../../render/materials/index.ts'
import type {InteractableConfig} from './types.ts'
import type {InteractableKind} from './kinds.ts'

/** 交互物默认尺寸（宽, 高, 深） */
export const INTERACTABLE_DEFAULT_SIZE: Record<InteractableKind, [number, number, number]> = {
    save_point: [0.8, 1.2, 0.8],
    teleport: [0.9, 1.6, 0.9],
    switch: [0.5, 0.8, 0.4],
    push_door_single: [0.15, 2.0, 1.2],
    push_door_double: [2.2, 2.0, 0.15],
    gate: [2.4, 2.4, 0.3],
    chest: [1.0, 0.8, 0.7],
    elevator: [2.0, 0.25, 2.0],
    breakable: [0.8, 0.8, 0.8],
}

/** 各类型的默认材质 */
export const INTERACTABLE_DEFAULT_MATERIAL: Record<InteractableKind, SurfaceMaterialId> = {
    save_point: 'rusty_iron',
    teleport: 'rusty_iron',
    switch: 'wood',
    push_door_single: 'wood',
    push_door_double: 'wood',
    gate: 'rusty_iron',
    chest: 'wood',
    elevator: 'rusty_iron',
    breakable: 'brick',
}

/** 默认配置工厂（编辑期生成 / 存档回退用） */
export const defaultInteractableConfig = (kind: InteractableKind): InteractableConfig => {
    const base = {material: INTERACTABLE_DEFAULT_MATERIAL[kind], size: [...INTERACTABLE_DEFAULT_SIZE[kind]] as [number, number, number], channel: ''}
    switch (kind) {
        case 'save_point': return {...base, kind, name: '篝火'}
        case 'teleport': return {...base, kind, name: '传送点'}
        case 'switch': return {...base, kind, mode: 'toggle'}
        case 'push_door_single': return {...base, kind, hingeQuarter: 0}
        case 'push_door_double': return {...base, kind, hingeQuarter: 0}
        case 'gate': return {...base, kind, travel: 2.4, speed: 2}
        case 'chest': return {...base, kind, capacity: 12}
        case 'elevator': return {...base, kind, travel: 4, speed: 1.2}
        case 'breakable': return {...base, kind, health: 30, breakableBy: ['melee', 'roll']}
    }
}

/** 门 / 闸门 / 升降梯的动作速度（进度/秒） */
export const DOOR_OPEN_SPEED = 1.6
export const GATE_DEFAULT_SPEED = 2
/** 开关瞬时模式的保持时间（秒） */
export const SWITCH_MOMENTARY_HOLD = 1.5
/** 可破坏道具被翻滚破坏时每次造成的伤害 */
export const ROLL_BREAK_DAMAGE = 25
/** 交互物碰撞体尺寸最小边长（防止 0 厚度碰撞体） */
export const MIN_COLLIDER_THICKNESS = 0.08
/** 箱子容器网格尺寸（俄罗斯方块布局） */
export const CHEST_GRID_WIDTH = 6
export const CHEST_GRID_HEIGHT = 4
