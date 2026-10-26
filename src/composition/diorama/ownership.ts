import type {OwnedRef, OwnershipEntry, OwnershipStore} from '../../types/ownership_store.ts'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {DioramaPorts} from './types.ts'

const sourceOf = (ports: DioramaPorts, ref: OwnedRef): EntityInfoSource | undefined => {
    switch (ref.type) {
        case 'box': return ports.box
        case 'area': return ports.area
        case 'terrain': return ports.terrain
        case 'character': return ports.character
        case 'interactable': return ports.interactable
        case 'item': return ports.item
        case 'building_generator': return ports.building
        default: return undefined
    }
}

const exists = (ports: DioramaPorts, ref: OwnedRef): boolean =>
    sourceOf(ports, ref)?.getEntityList().some(entry => entry.id === ref.runtimeId) ?? false

/** 列出箱庭的全部有效子实体 / 建筑世界，并裁剪已被手动删除的失效引用 */
export const ownedEntriesOf = (
    store: OwnershipStore,
    ports: DioramaPorts,
    dioramaId: string,
): OwnershipEntry[] => store.entriesOf(dioramaId, ref => exists(ports, ref))

/** 删除箱庭的全部子实体（不删除箱庭自身） */
export const deleteOwnedEntities = (
    store: OwnershipStore,
    ports: DioramaPorts,
    dioramaId: string,
): void => {
    const entries = ownedEntriesOf(store, ports, dioramaId)
    for (const entry of entries) {
        const source = sourceOf(ports, entry.ref)
        source?.remove(entry.ref.runtimeId)
        store.remove(entry.ref)
    }
}

const meshOf = (ports: DioramaPorts, ref: OwnedRef) =>
    sourceOf(ports, ref)?.getEntityList().find(entry => entry.id === ref.runtimeId)?.mesh

const rotateXZ = (x: number, z: number, q: number): [number, number] => {
    const k = ((q % 4) + 4) % 4
    if (k === 0) return [x, z]
    if (k === 1) return [-z, x]
    if (k === 2) return [-x, -z]
    return [z, -x]
}

/**
 * 整体移动 / 旋转箱庭：把全部子实体从旧根变换换算到新根变换。
 * 角色等只支持水平旋转的系统由各自 setTransform 内部忽略不支持的轴。
 */
export const transformOwnedEntities = (
    store: OwnershipStore,
    ports: DioramaPorts,
    dioramaId: string,
    oldOrigin: {x: number; y: number; z: number},
    oldYawQuarter: number,
    newOrigin: {x: number; y: number; z: number},
    newYawQuarter: number,
): void => {
    const yawDelta = ((newYawQuarter - oldYawQuarter) % 4 + 4) % 4
    for (const entry of ownedEntriesOf(store, ports, dioramaId)) {
        const mesh = meshOf(ports, entry.ref)
        if (mesh === undefined) continue
        const [rx, rz] = rotateXZ(
            mesh.position.x - oldOrigin.x,
            mesh.position.z - oldOrigin.z,
            (4 - oldYawQuarter) % 4,
        )
        const [nx, nz] = rotateXZ(rx, rz, newYawQuarter)
        const rotY = (mesh.rotation.y * 180 / Math.PI + yawDelta * 90) % 360
        sourceOf(ports, entry.ref)?.setTransform(
            entry.ref.runtimeId,
            {x: newOrigin.x + nx, y: newOrigin.y + (mesh.position.y - oldOrigin.y), z: newOrigin.z + nz},
            {x: 0, y: rotY, z: 0},
        )
    }
}
