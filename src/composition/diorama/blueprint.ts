import {buildingAnchors} from '../../entity/building_generator/types/index.ts'
import {
    DIORAMA_BLUEPRINT_VERSION,
    MAX_DIORAMA_NODES,
    MAX_POPULATION_RULES,
    MAX_POPULATION_TOTAL,
    type BuildingNode,
    type ConnectionNode,
    type DioramaBlueprint,
    type DioramaDiagnostic,
    type DioramaNode,
    type PopulationRule,
} from './types.ts'

export const createEmptyBlueprint = (recipeId = ''): DioramaBlueprint => ({
    version: DIORAMA_BLUEPRINT_VERSION,
    recipeId,
    seed: 0,
    nodes: [],
    population: [],
})

const error = (code: string, message: string, extra: {nodeId?: string; ruleId?: string} = {}): DioramaDiagnostic => ({
    severity: 'error',
    code,
    message,
    ...extra,
})

const warning = (code: string, message: string, extra: {nodeId?: string; ruleId?: string} = {}): DioramaDiagnostic => ({
    severity: 'warning',
    code,
    message,
    ...extra,
})

const walkNodes = (nodes: readonly DioramaNode[], visit: (node: DioramaNode) => void): void => {
    for (const node of nodes) {
        visit(node)
        if (node.kind === 'group') walkNodes(node.children, visit)
    }
}

const isBuilding = (node: DioramaNode): node is BuildingNode => node.kind === 'building'

const slotIdsOf = (node: BuildingNode): Set<string> => {
    const ids = new Set<string>()
    for (const anchor of buildingAnchors(node.config)) ids.add(anchor.id)
    for (const slot of node.slots ?? []) ids.add(slot.id)
    return ids
}

const finiteVec = (value: readonly [number, number, number]): boolean =>
    value.length === 3 && value.every(item => Number.isFinite(item))

const validateNode = (node: DioramaNode, diagnostics: DioramaDiagnostic[]): void => {
    if (typeof node.nodeId !== 'string' || node.nodeId.length === 0) {
        diagnostics.push(error('node.id', '节点缺少有效 nodeId'))
    }
    if (!finiteVec(node.position)) {
        diagnostics.push(error('node.position', '节点坐标必须是三个有限数', {nodeId: node.nodeId}))
    }
    if (!Number.isInteger(node.yawQuarter) || node.yawQuarter < 0 || node.yawQuarter > 3) {
        diagnostics.push(error('node.yaw', '节点偏航必须是 0..3 的整数', {nodeId: node.nodeId}))
    }
    switch (node.kind) {
        case 'building':
            if (node.config.sizeX <= 0 || node.config.sizeY <= 0 || node.config.sizeZ <= 0) {
                diagnostics.push(error('node.building.size', '建筑尺寸必须为正', {nodeId: node.nodeId}))
            }
            break
        case 'terrain':
            if (node.config.gridSize <= 0 || node.config.cellSize <= 0) {
                diagnostics.push(error('node.terrain.size', '地形网格尺寸必须为正', {nodeId: node.nodeId}))
            }
            break
        case 'area':
            if (node.config.shape.kind !== 'box' && node.config.shape.radius <= 0) {
                diagnostics.push(error('node.area.size', '区域半径必须为正', {nodeId: node.nodeId}))
            }
            break
        case 'connection':
            break
        case 'group':
            if (node.children.length === 0) {
                diagnostics.push(warning('node.group.empty', '分组节点没有子节点', {nodeId: node.nodeId}))
            }
            break
    }
}

const validateConnection = (
    node: ConnectionNode,
    buildingNodes: ReadonlyMap<string, BuildingNode>,
    diagnostics: DioramaDiagnostic[],
): void => {
    const from = buildingNodes.get(node.fromNodeId)
    const to = buildingNodes.get(node.toNodeId)
    if (from === undefined) {
        diagnostics.push(error('connection.from', `连接起点节点不存在：${node.fromNodeId}`, {nodeId: node.nodeId}))
    } else if (!slotIdsOf(from).has(node.fromSlotId)) {
        diagnostics.push(error('connection.fromSlot', `连接起点槽位不存在：${node.fromSlotId}`, {nodeId: node.nodeId}))
    }
    if (to === undefined) {
        diagnostics.push(error('connection.to', `连接终点节点不存在：${node.toNodeId}`, {nodeId: node.nodeId}))
    } else if (!slotIdsOf(to).has(node.toSlotId)) {
        diagnostics.push(error('connection.toSlot', `连接终点槽位不存在：${node.toSlotId}`, {nodeId: node.nodeId}))
    }
    const hostId = node.hostNodeId ?? node.fromNodeId
    if (!buildingNodes.has(hostId)) {
        diagnostics.push(error('connection.host', `连接宿主建筑不存在：${hostId}`, {nodeId: node.nodeId}))
    }
}

const ruleCount = (rule: PopulationRule): number => {
    if (rule.count !== undefined && Number.isFinite(rule.count) && rule.count > 0) return Math.floor(rule.count)
    if (rule.density !== undefined && rule.density > 0) return Math.max(1, Math.floor(rule.density))
    return 1
}

/** 运行时蓝图校验：结构性错误不抛异常，统一返回诊断 */
export const validateBlueprint = (blueprint: DioramaBlueprint): DioramaDiagnostic[] => {
    const diagnostics: DioramaDiagnostic[] = []
    if (blueprint.version !== DIORAMA_BLUEPRINT_VERSION) {
        diagnostics.push(error('blueprint.version', `不支持的蓝图版本：${blueprint.version}`))
    }
    if (!Number.isFinite(blueprint.seed)) {
        diagnostics.push(error('blueprint.seed', '蓝图种子必须是有限数'))
    }
    if (blueprint.nodes.length > MAX_DIORAMA_NODES) {
        diagnostics.push(error('blueprint.nodeLimit', `节点数量超过上限 ${MAX_DIORAMA_NODES}`))
    }
    if (blueprint.population.length > MAX_POPULATION_RULES) {
        diagnostics.push(error('blueprint.ruleLimit', `人口规则数量超过上限 ${MAX_POPULATION_RULES}`))
    }

    const seenNodes = new Set<string>()
    const buildingNodes = new Map<string, BuildingNode>()
    walkNodes(blueprint.nodes, node => {
        if (seenNodes.has(node.nodeId)) {
            diagnostics.push(error('node.duplicate', `节点 id 重复：${node.nodeId}`, {nodeId: node.nodeId}))
        }
        seenNodes.add(node.nodeId)
        validateNode(node, diagnostics)
        if (isBuilding(node)) buildingNodes.set(node.nodeId, node)
    })

    walkNodes(blueprint.nodes, node => {
        if (node.kind === 'connection') validateConnection(node, buildingNodes, diagnostics)
    })

    const seenRules = new Set<string>()
    let total = 0
    for (const rule of blueprint.population) {
        if (seenRules.has(rule.id)) {
            diagnostics.push(error('population.duplicate', `人口规则 id 重复：${rule.id}`, {ruleId: rule.id}))
        }
        seenRules.add(rule.id)
        if (rule.zoneId !== '' && !seenNodes.has(rule.zoneId)) {
            diagnostics.push(error('population.zone', `人口规则分区不存在：${rule.zoneId}`, {ruleId: rule.id}))
        }
        const hasExplicitAnchor = rule.anchorNodeId !== undefined && rule.anchorSlotId !== undefined
        if (rule.placement === 'anchor' && !hasExplicitAnchor) {
            diagnostics.push(error('population.anchor', '锚点放置必须指定 anchorNodeId 与 anchorSlotId', {ruleId: rule.id}))
        }
        if ((rule.placement === 'roof' || rule.placement === 'interior') && !hasExplicitAnchor && rule.zoneId === '') {
            diagnostics.push(error('population.anchor', '屋顶 / 室内放置必须指定锚点或建筑分区', {ruleId: rule.id}))
        }
        if (rule.count !== undefined && (!Number.isFinite(rule.count) || rule.count <= 0)) {
            diagnostics.push(error('population.count', '人口数量必须为正数', {ruleId: rule.id}))
        }
        if (rule.kind === 'item' && rule.defId.length === 0) {
            diagnostics.push(error('population.item', '掉落物规则缺少 defId', {ruleId: rule.id}))
        }
        total += ruleCount(rule)
    }
    if (total > MAX_POPULATION_TOTAL) {
        diagnostics.push(error('population.limit', `人口总数超过上限 ${MAX_POPULATION_TOTAL}`))
    }

    return diagnostics
}

/** 是否存在阻止生成的错误 */
export const hasErrors = (diagnostics: readonly DioramaDiagnostic[]): boolean =>
    diagnostics.some(item => item.severity === 'error')

/** 深拷贝蓝图（只含 JSON-safe 数据；用于运行时隔离与存档） */
export const cloneBlueprint = (blueprint: DioramaBlueprint): DioramaBlueprint =>
    structuredClone(blueprint)
