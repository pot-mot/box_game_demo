import {buildingAnchors, type BuildingAnchor} from '../../entity/building_generator/types/index.ts'
import type {AreaConfig} from '../../entity/area/types/index.ts'
import type {
    BuildingNode,
    ConnectionNode,
    DioramaBlueprint,
    DioramaDiagnostic,
    DioramaNode,
    ResolvedSlot,
    SlotDirection,
} from './types.ts'
import {hasErrors, validateBlueprint} from './blueprint.ts'

export interface Vec3 {
    readonly x: number
    readonly y: number
    readonly z: number
}

export interface PlannedNode {
    readonly node: DioramaNode
    readonly origin: Vec3
    readonly yawQuarter: number
}

export interface Footprint {
    readonly nodeId: string
    readonly minX: number
    readonly maxX: number
    readonly minZ: number
    readonly maxZ: number
}

export interface PlannedConnection {
    readonly node: ConnectionNode
    readonly from: ResolvedSlot
    readonly to: ResolvedSlot
    readonly hostNodeId: string
}

export interface DioramaPlan {
    readonly rootOrigin: Vec3
    readonly rootYawQuarter: number
    readonly nodes: readonly PlannedNode[]
    readonly buildings: ReadonlyMap<string, PlannedNode & {node: BuildingNode}>
    readonly footprints: readonly Footprint[]
    readonly slots: ReadonlyMap<string, ResolvedSlot>
    readonly connections: readonly PlannedConnection[]
    readonly bounds: Footprint
    readonly diagnostics: readonly DioramaDiagnostic[]
}

/** 局部 (x,z) 绕原点顺时针旋转 q*90° */
export const rotateXZ = (x: number, z: number, q: number): [number, number] => {
    const k = ((q % 4) + 4) % 4
    if (k === 0) return [x, z]
    if (k === 1) return [-z, x]
    if (k === 2) return [-x, -z]
    return [z, -x]
}

const rotateDir = (dir: SlotDirection, q: number): SlotDirection => {
    const [x, z] = dir === '+x' ? [1, 0] : dir === '-x' ? [-1, 0] : dir === '+z' ? [0, 1] : [0, -1]
    const [rx, rz] = rotateXZ(x, z, q)
    if (rx > 0) return '+x'
    if (rx < 0) return '-x'
    return rz > 0 ? '+z' : '-z'
}

interface MutableBounds {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
}

const emptyBounds = (): MutableBounds => ({
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
})

const unionBounds = (target: MutableBounds, other: Footprint): void => {
    target.minX = Math.min(target.minX, other.minX)
    target.maxX = Math.max(target.maxX, other.maxX)
    target.minZ = Math.min(target.minZ, other.minZ)
    target.maxZ = Math.max(target.maxZ, other.maxZ)
}

const rectFootprint = (
    nodeId: string,
    origin: Vec3,
    yawQuarter: number,
    localMinX: number,
    localMaxX: number,
    localMinZ: number,
    localMaxZ: number,
): Footprint => {
    const corners: Array<[number, number]> = [
        [localMinX, localMinZ],
        [localMaxX, localMinZ],
        [localMinX, localMaxZ],
        [localMaxX, localMaxZ],
    ]
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const [x, z] of corners) {
        const [rx, rz] = rotateXZ(x, z, yawQuarter)
        minX = Math.min(minX, origin.x + rx)
        maxX = Math.max(maxX, origin.x + rx)
        minZ = Math.min(minZ, origin.z + rz)
        maxZ = Math.max(maxZ, origin.z + rz)
    }
    return {nodeId, minX, maxX, minZ, maxZ}
}

const areaFootprint = (nodeId: string, config: AreaConfig, origin: Vec3, yawQuarter: number): Footprint => {
    if (config.shape.kind === 'box') {
        return rectFootprint(nodeId, origin, yawQuarter, -config.shape.width / 2, config.shape.width / 2, -config.shape.depth / 2, config.shape.depth / 2)
    }
    const r = config.shape.radius
    return rectFootprint(nodeId, origin, yawQuarter, -r, r, -r, r)
}

const nodeFootprint = (node: DioramaNode, origin: Vec3, yawQuarter: number): Footprint | undefined => {
    if (node.kind === 'building') {
        return rectFootprint(node.nodeId, origin, yawQuarter, 0, node.config.sizeX, 0, node.config.sizeZ)
    }
    if (node.kind === 'terrain') {
        const span = node.config.gridSize * node.config.cellSize
        return rectFootprint(node.nodeId, origin, yawQuarter, 0, span, 0, span)
    }
    if (node.kind === 'area') {
        return areaFootprint(node.nodeId, node.config, origin, yawQuarter)
    }
    return undefined
}

const overlaps = (a: Footprint, b: Footprint): boolean =>
    a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ

const slotKey = (nodeId: string, slotId: string): string => `${nodeId}:${slotId}`

const buildingSlotAnchors = (node: BuildingNode): BuildingAnchor[] => {
    const anchors: BuildingAnchor[] = [...buildingAnchors(node.config)]
    for (const slot of node.slots ?? []) {
        anchors.push({id: slot.id, position: [slot.position[0], slot.position[1], slot.position[2]], dir: slot.dir})
    }
    return anchors
}

/**
 * 解析蓝图：展开组变换、计算建筑 / 区域足迹、解析槽位与连接端点。
 * 所有结构问题进入 diagnostics，不抛异常；存在 error 时调用方不得执行重建。
 */
export const solveDioramaPlan = (
    blueprint: DioramaBlueprint,
    rootOrigin: Vec3 = {x: 0, y: 0, z: 0},
    rootYaw = 0,
): DioramaPlan => {
    const diagnostics: DioramaDiagnostic[] = [...validateBlueprint(blueprint)]
    const nodes: PlannedNode[] = []
    const buildings = new Map<string, PlannedNode & {node: BuildingNode}>()
    const footprints: Footprint[] = []
    const slots = new Map<string, ResolvedSlot>()
    const bounds = emptyBounds()

    const walk = (
        list: readonly DioramaNode[],
        parentOrigin: Vec3,
        parentYaw: number,
    ): void => {
        for (const node of list) {
            const [dx, dz] = rotateXZ(node.position[0], node.position[2], parentYaw)
            const origin: Vec3 = {
                x: parentOrigin.x + dx,
                y: parentOrigin.y + node.position[1],
                z: parentOrigin.z + dz,
            }
            const yawQuarter = ((parentYaw + node.yawQuarter) % 4 + 4) % 4
            const planned: PlannedNode = {node, origin, yawQuarter}
            nodes.push(planned)

            if (node.kind === 'building') {
                buildings.set(node.nodeId, {node, origin, yawQuarter})
                for (const anchor of buildingSlotAnchors(node)) {
                    const [ax, az] = rotateXZ(anchor.position[0], anchor.position[2], yawQuarter)
                    slots.set(slotKey(node.nodeId, anchor.id), {
                        nodeId: node.nodeId,
                        slotId: anchor.id,
                        position: [origin.x + ax, origin.y + anchor.position[1], origin.z + az],
                        dir: rotateDir(anchor.dir, yawQuarter),
                    })
                }
            }

            const footprint = nodeFootprint(node, origin, yawQuarter)
            if (footprint !== undefined) {
                footprints.push(footprint)
                unionBounds(bounds, footprint)
            }

            if (node.kind === 'group') walk(node.children, origin, yawQuarter)
        }
    }

    walk(blueprint.nodes, rootOrigin, rootYaw)

    /* 结构足迹重叠：地形作为基底不参与，建筑 / 区域互相校验 */
    const solid = footprints.filter(f => {
        const node = nodes.find(planned => planned.node.nodeId === f.nodeId)?.node
        return node?.kind === 'building' || node?.kind === 'area'
    })
    for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
            if (overlaps(solid[i], solid[j])) {
                diagnostics.push({
                    severity: 'error',
                    code: 'plan.overlap',
                    message: `节点足迹重叠：${solid[i].nodeId} 与 ${solid[j].nodeId}`,
                    nodeId: solid[j].nodeId,
                })
            }
        }
    }

    const connections: PlannedConnection[] = []
    for (const node of nodes) {
        if (node.node.kind !== 'connection') continue
        const connection = node.node
        const from = slots.get(slotKey(connection.fromNodeId, connection.fromSlotId))
        const to = slots.get(slotKey(connection.toNodeId, connection.toSlotId))
        if (from === undefined || to === undefined) continue
        if (connection.connectionKind === 'stairs') {
            const dx = Math.abs(to.position[0] - from.position[0])
            const dz = Math.abs(to.position[2] - from.position[2])
            if (dx > 1e-6 && dz > 1e-6) {
                diagnostics.push({
                    severity: 'error',
                    code: 'plan.stairs.axis',
                    message: '直跑楼梯连接端点必须共享 X 或 Z 轴',
                    nodeId: connection.nodeId,
                })
            }
            if (to.position[1] <= from.position[1]) {
                diagnostics.push({
                    severity: 'error',
                    code: 'plan.stairs.rise',
                    message: '直跑楼梯终点必须高于起点',
                    nodeId: connection.nodeId,
                })
            }
        }
        connections.push({
            node: connection,
            from,
            to,
            hostNodeId: connection.hostNodeId ?? connection.fromNodeId,
        })
    }

    if (nodes.length === 0) {
        diagnostics.push({severity: 'error', code: 'plan.empty', message: '蓝图没有任何节点'})
    }
    if (footprints.length === 0) {
        diagnostics.push({severity: 'error', code: 'plan.noFootprint', message: '蓝图没有可用于人口放置的结构足迹'})
    }

    return {
        rootOrigin,
        rootYawQuarter: ((rootYaw % 4) + 4) % 4,
        nodes,
        buildings,
        footprints,
        slots,
        connections,
        bounds: {nodeId: '', ...bounds},
        diagnostics,
    }
}

/** 蓝图能否执行（无 error） */
export const canMaterialize = (plan: DioramaPlan): boolean => !hasErrors(plan.diagnostics)

/** 解析某人口规则的锚点（用于 roof / interior / anchor 放置） */
export const resolveRuleAnchor = (plan: DioramaPlan, nodeId: string, slotId: string): ResolvedSlot | undefined =>
    plan.slots.get(slotKey(nodeId, slotId))
