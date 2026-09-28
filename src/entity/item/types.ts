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
    rowText: string
}

/** 掉落物存档条目 */
export interface SavableItemEntry {
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
    loadSave: (items: readonly SavableItemEntry[]) => void
}
