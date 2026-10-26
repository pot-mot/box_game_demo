import type {OwnedRef} from '../../types/ownership_store.ts'
import type {BuildingStructureSpec} from '../../entity/building_generator/types/index.ts'
import type {DioramaDiagnostic, DioramaPorts} from './types.ts'
import {rotateXZ, type DioramaPlan, type PlannedNode, type Vec3} from './plan.ts'
import type {PopulationSpawn} from './population.ts'

export interface MaterializeResult {
    readonly refs: readonly OwnedRef[]
    readonly diagnostics: readonly DioramaDiagnostic[]
}

const warning = (code: string, message: string, nodeId?: string): DioramaDiagnostic => ({
    severity: 'warning',
    code,
    message,
    ...(nodeId === undefined ? {} : {nodeId}),
})

const localOf = (world: Vec3, host: PlannedNode): Vec3 => {
    const [x, z] = rotateXZ(world.x - host.origin.x, world.z - host.origin.z, (4 - host.yawQuarter) % 4)
    return {x, y: world.y - host.origin.y, z}
}

const dirQuarterOf = (dx: number, dz: number): number | undefined => {
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return undefined
    if (Math.abs(dx) >= Math.abs(dz) && Math.abs(dz) < 1e-6) return dx >= 0 ? 0 : 2
    if (Math.abs(dz) > Math.abs(dx) && Math.abs(dx) < 1e-6) return dz >= 0 ? 1 : 3
    return undefined
}

/** 经各实体公开端口创建蓝图结构与小物件，并登记归属 */
export const materializeDiorama = (
    ports: DioramaPorts,
    plan: DioramaPlan,
    dioramaId: string,
    spawns: readonly PopulationSpawn[],
): MaterializeResult => {
    const refs: OwnedRef[] = []
    const diagnostics: DioramaDiagnostic[] = []
    const worldIds = new Map<string, number>()

    const ownerOf = (nodeId: string) => ({dioramaId, nodeId})

    for (const planned of plan.nodes) {
        const {node} = planned
        switch (node.kind) {
            case 'building': {
                const world = ports.building.add(node.config, planned.origin.x, planned.origin.y, planned.origin.z, planned.yawQuarter)
                world.owner = ownerOf(node.nodeId)
                ports.ownership.set({type: 'building_generator', runtimeId: world.id}, ownerOf(node.nodeId))
                worldIds.set(node.nodeId, world.id)
                refs.push({type: 'building_generator', runtimeId: world.id})
                break
            }
            case 'terrain': {
                if (ports.terrain === undefined) {
                    diagnostics.push(warning('materialize.terrain', '地形端口不可用，已跳过', node.nodeId))
                    break
                }
                const added = ports.terrain.add(node.config, planned.origin.x, planned.origin.y, planned.origin.z)
                ports.ownership.set({type: 'terrain', runtimeId: added.id}, ownerOf(node.nodeId))
                refs.push({type: 'terrain', runtimeId: added.id})
                break
            }
            case 'area': {
                if (ports.area === undefined) {
                    diagnostics.push(warning('materialize.area', '区域端口不可用，已跳过', node.nodeId))
                    break
                }
                const added = ports.area.add(node.config, planned.origin.x, planned.origin.y, planned.origin.z)
                ports.ownership.set({type: 'area', runtimeId: added.id}, ownerOf(node.nodeId))
                refs.push({type: 'area', runtimeId: added.id})
                break
            }
            case 'group':
                break
            case 'connection':
                break
        }
    }

    /* 连接结构在宿主建筑世界创建后写入 */
    for (const connection of plan.connections) {
        const hostPlan = plan.buildings.get(connection.hostNodeId)
        const hostWorldId = worldIds.get(connection.hostNodeId)
        if (hostPlan === undefined || hostWorldId === undefined) {
            diagnostics.push(warning('materialize.connectionHost', '连接宿主建筑缺失，已跳过', connection.node.nodeId))
            continue
        }
        const from = localOf({x: connection.from.position[0], y: connection.from.position[1], z: connection.from.position[2]}, hostPlan)
        const to = localOf({x: connection.to.position[0], y: connection.to.position[1], z: connection.to.position[2]}, hostPlan)
        let spec: BuildingStructureSpec | undefined
        if (connection.node.connectionKind === 'corridor') {
            spec = {
                kind: 'corridor',
                x0: from.x,
                z0: from.z,
                x1: to.x,
                z1: to.z,
                y: from.y,
                width: connection.node.width ?? 2,
                material: connection.node.material,
                railing: connection.node.railing,
            }
        } else {
            const dirQuarter = dirQuarterOf(to.x - from.x, to.z - from.z)
            if (dirQuarter === undefined) {
                diagnostics.push(warning('materialize.stairsAxis', '楼梯端点在对角线上，已跳过', connection.node.nodeId))
                continue
            }
            spec = {
                kind: 'stairs',
                ox: from.x,
                oy: from.y,
                oz: from.z,
                dirQuarter,
                steps: Math.max(2, Math.round(to.y - from.y)),
                width: connection.node.width ?? 1,
                material: connection.node.material,
            }
        }
        ports.building.stampStructure(hostWorldId, spec)
    }

    /* 小物件 */
    for (const spawn of spawns) {
        const ruleNode = spawn.ownerNodeId
        switch (spawn.kind) {
            case 'box': {
                if (ports.box === undefined) break
                const added = ports.box.add(spawn.config, spawn.position.x, spawn.position.y, spawn.position.z)
                ports.ownership.set({type: 'box', runtimeId: added.id}, ownerOf(ruleNode))
                refs.push({type: 'box', runtimeId: added.id})
                break
            }
            case 'interactable': {
                if (ports.interactable === undefined) break
                const added = ports.interactable.add(
                    spawn.config, spawn.position.x, spawn.position.y, spawn.position.z, spawn.yawQuarter,
                )
                ports.ownership.set({type: 'interactable', runtimeId: added.id}, ownerOf(ruleNode))
                refs.push({type: 'interactable', runtimeId: added.id})
                break
            }
            case 'item': {
                if (ports.item === undefined) break
                const added = ports.item.drop(
                    spawn.defId, spawn.count, spawn.position.x, spawn.position.y, spawn.position.z,
                )
                ports.ownership.set({type: 'item', runtimeId: added.id}, ownerOf(ruleNode))
                refs.push({type: 'item', runtimeId: added.id})
                break
            }
            case 'character': {
                if (ports.character === undefined) break
                const added = ports.character.add(
                    spawn.config, spawn.position.x, spawn.position.y, spawn.position.z,
                )
                ports.ownership.set({type: 'character', runtimeId: added.id}, ownerOf(ruleNode))
                refs.push({type: 'character', runtimeId: added.id})
                break
            }
            case 'decor': {
                const hostWorldId = worldIds.get(spawn.hostNodeId)
                if (hostWorldId === undefined) break
                ports.building.placeProp(
                    hostWorldId, spawn.propKind, spawn.material,
                    spawn.localPosition.x, spawn.localPosition.y, spawn.localPosition.z,
                    spawn.yawQuarter,
                )
                break
            }
        }
    }

    return {refs, diagnostics}
}
