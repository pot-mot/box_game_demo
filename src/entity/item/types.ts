import type {Mesh} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {EntityInfoSource} from '../box/base/types/entity_info.ts'
import type {InteractionTarget} from '../../character/interaction/types.ts'

/** 掉落物实例（固定 body + sensor，漂浮小立方体） */
export interface DroppedItemEntity {
    id: number
    defId: string
    count: number
    mesh: Mesh
    body: RAPIER.RigidBody
    /** 自转相位（只在物理步内累加，避免被渲染插值写回污染） */
    spin: number
    rowText: string
}

/** 掉落物存档条目 */
export interface SavableItemEntry {
    /** 运行时 id（仅序列化归属用，不写入存档字段） */
    id?: number
    defId: string
    count: number
    position: [number, number, number]
    quaternion: [number, number, number, number]
}

/** 掉落物实体系统公开接口 */
export interface ItemEntityContext extends EntityInfoSource {
    drop: (defId: string, count: number, x: number, y: number, z: number) => {id: number}
    getAll: () => readonly DroppedItemEntity[]
    getById: (id: number) => DroppedItemEntity | undefined
    collectInteractionTargets: (actorX: number, actorY: number, actorZ: number, out: InteractionTarget[]) => number
    activateInteraction: (key: string) => boolean
    /** 实体 tick：漂浮/自转动画（注册进 main.ts systems 后由物理循环调用） */
    preSync: (dt: number, time: number) => void
    /** 拾取回调：返回 true 表示已拾取（实体移除），false 表示背包满（实体保留） */
    setPickupHandler: (handler: (defId: string, count: number) => boolean) => void
    getSave: () => SavableItemEntry[]
    /** 批量恢复；返回与输入等长的 id 列表（未知物品 / 非法条目为 undefined） */
    loadSave: (items: readonly SavableItemEntry[]) => Array<number | undefined>
}
