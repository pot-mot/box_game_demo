import type {BoxConfig} from '../../entity/box/types/index.ts'
import type {InteractableConfig} from '../../entity/interactable/types.ts'
import type {BuildingPropKind} from '../../entity/building_generator/props/kinds.ts'
import type {SurfaceMaterialId} from '../../render/materials/index.ts'
import {
    MAX_POPULATION_TOTAL,
    type CharacterAddConfig,
    type DioramaBlueprint,
    type DioramaDiagnostic,
    type PopulationRule,
} from './types.ts'
import {rotateXZ, type DioramaPlan, type Footprint, resolveRuleAnchor, type Vec3} from './plan.ts'

/** 确定性 mulberry32（组合层独立实现，避免依赖建筑生成器内部） */
const createRng = (seed: number): (() => number) => {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6D2B79F5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const hashSeed = (seed: number, key: string): number => {
    let h = seed >>> 0
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0
    return h >>> 0
}

interface PopulationSpawnBase {
    /** 归属节点：规则分区；空串规则归到根 */
    readonly ownerNodeId: string
}

export type PopulationSpawn =
    | (PopulationSpawnBase & {readonly kind: 'box'; readonly config: BoxConfig; readonly position: Vec3})
    | (PopulationSpawnBase & {readonly kind: 'interactable'; readonly config: InteractableConfig; readonly position: Vec3; readonly yawQuarter: number})
    | (PopulationSpawnBase & {readonly kind: 'item'; readonly defId: string; readonly count: number; readonly position: Vec3})
    | (PopulationSpawnBase & {readonly kind: 'character'; readonly config: CharacterAddConfig; readonly position: Vec3; readonly yawQuarter: number})
    | (PopulationSpawnBase & {
        readonly kind: 'decor'
        readonly hostNodeId: string
        readonly propKind: BuildingPropKind
        readonly material: SurfaceMaterialId
        readonly localPosition: Vec3
        readonly yawQuarter: number
    })

export interface PopulationResult {
    readonly spawns: readonly PopulationSpawn[]
    readonly diagnostics: readonly DioramaDiagnostic[]
}

const footprintOf = (plan: DioramaPlan, nodeId: string): Footprint | undefined =>
    plan.footprints.find(f => f.nodeId === nodeId)

const inside = (x: number, z: number, footprint: Footprint, margin = 0): boolean =>
    x >= footprint.minX - margin && x <= footprint.maxX + margin &&
    z >= footprint.minZ - margin && z <= footprint.maxZ + margin

const pointDistanceSq = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2

const countOf = (rule: PopulationRule, area: number): number => {
    if (rule.count !== undefined) return Math.max(0, Math.floor(rule.count))
    if (rule.density !== undefined) return Math.max(1, Math.floor(rule.density * area / 16))
    return 1
}

const groundY = (
    plan: DioramaPlan,
    x: number,
    z: number,
    terrainQuery: ((x: number, z: number, refY: number) => number | undefined) | undefined,
): number => {
    if (terrainQuery === undefined) return plan.rootOrigin.y
    return terrainQuery(x, z, plan.rootOrigin.y + 8) ?? plan.rootOrigin.y
}

/**
 * 规则式人口生成：确定性种子、最小间距、避开结构足迹、数量上限。
 * 结果只描述待创建实体，真正创建由 materialize 经各实体端口完成。
 */
export const generatePopulation = (
    blueprint: DioramaBlueprint,
    plan: DioramaPlan,
    terrainQuery?: (x: number, z: number, refY: number) => number | undefined,
): PopulationResult => {
    const diagnostics: DioramaDiagnostic[] = []
    const spawns: PopulationSpawn[] = []
    const occupied: Vec3[] = []

    for (const rule of blueprint.population) {
        if (spawns.length >= MAX_POPULATION_TOTAL) {
            diagnostics.push({
                severity: 'warning',
                code: 'population.limit',
                message: `人口总数达到上限 ${MAX_POPULATION_TOTAL}，后续规则被跳过`,
                ruleId: rule.id,
            })
            break
        }
        const zone = rule.zoneId === '' ? plan.bounds : footprintOf(plan, rule.zoneId)
        if (zone === undefined) {
            diagnostics.push({
                severity: 'warning',
                code: 'population.zone',
                message: `人口规则分区不存在：${rule.zoneId}`,
                ruleId: rule.id,
            })
            continue
        }
        const width = Math.max(1, zone.maxX - zone.minX)
        const depth = Math.max(1, zone.maxZ - zone.minZ)
        const count = Math.min(countOf(rule, width * depth), MAX_POPULATION_TOTAL - spawns.length)
        const rng = createRng(hashSeed(blueprint.seed ^ plan.rootOrigin.x * 31 ^ plan.rootOrigin.z * 17, rule.id))
        const spacing = rule.minSpacing ?? 1.5
        const blocked = plan.footprints.filter(f => {
            if (f.nodeId === rule.zoneId) return false
            const node = plan.nodes.find(item => item.node.nodeId === f.nodeId)?.node
            return node?.kind === 'building' || node?.kind === 'area'
        })
        const needsAnchor = rule.placement === 'anchor' || rule.placement === 'roof' || rule.placement === 'interior'
        const explicitAnchor = rule.anchorNodeId !== undefined && rule.anchorSlotId !== undefined
            ? resolveRuleAnchor(plan, rule.anchorNodeId, rule.anchorSlotId)
            : undefined
        const autoSlotId = rule.placement === 'roof' ? 'roof' : rule.placement === 'interior' ? 'interior' : undefined
        const autoAnchor = autoSlotId !== undefined && rule.zoneId !== ''
            ? resolveRuleAnchor(plan, rule.zoneId, autoSlotId)
            : undefined
        const anchor = explicitAnchor ?? autoAnchor
        if (needsAnchor && anchor === undefined) {
            diagnostics.push({
                severity: 'warning',
                code: 'population.anchor',
                message: '放置规则缺少有效锚点，已跳过',
                ruleId: rule.id,
            })
            continue
        }

        let placed = 0
        for (let attempt = 0; attempt < count * 32 && placed < count; attempt++) {
            const x = anchor !== undefined ? anchor.position[0] : zone.minX + rng() * width
            const z = anchor !== undefined ? anchor.position[2] : zone.minZ + rng() * depth
            if (anchor !== undefined) {
                if (rule.count !== undefined && placed >= 1 && spacing > 0) break
            } else {
                if (blocked.some(f => inside(x, z, f, spacing * 0.5))) continue
                if (occupied.some(p => pointDistanceSq(p, {x, y: 0, z}) < spacing * spacing)) continue
            }
            const surfaceY = anchor !== undefined ? anchor.position[1] : groundY(plan, x, z, terrainQuery)
            const position: Vec3 = {x, y: surfaceY, z}
            const yawQuarter = anchor !== undefined
                ? (((anchor.dir === '+z' ? 0 : anchor.dir === '+x' ? 1 : anchor.dir === '-z' ? 2 : 3) + 2) % 4)
                : rule.kind === 'decor' ? 0 : Math.floor(rng() * 4)
            const ownerNodeId = rule.zoneId === '' ? '@root' : rule.zoneId
            switch (rule.kind) {
                case 'box':
                    spawns.push({
                        kind: 'box',
                        ownerNodeId,
                        config: rule.config,
                        position: {x, y: surfaceY + rule.config.height / 2, z},
                    })
                    break
                case 'interactable':
                    spawns.push({kind: 'interactable', ownerNodeId, config: rule.config, position, yawQuarter})
                    break
                case 'item':
                    spawns.push({kind: 'item', ownerNodeId, defId: rule.defId, count: rule.countPerSpawn ?? 1, position})
                    break
                case 'character':
                    spawns.push({kind: 'character', ownerNodeId, config: rule.config, position, yawQuarter})
                    break
                case 'decor': {
                    const host = plan.buildings.get(rule.anchorNodeId ?? rule.zoneId)
                    if (host === undefined) {
                        diagnostics.push({
                            severity: 'warning',
                            code: 'population.decorHost',
                            message: '装饰规则缺少建筑宿主，已跳过',
                            ruleId: rule.id,
                        })
                        continue
                    }
                    const [lx, lz] = rotateXZ(x - host.origin.x, z - host.origin.z, (4 - host.yawQuarter) % 4)
                    spawns.push({
                        kind: 'decor',
                        ownerNodeId: host.node.nodeId,
                        hostNodeId: host.node.nodeId,
                        propKind: rule.propKind,
                        material: rule.material,
                        localPosition: {x: lx, y: surfaceY - host.origin.y, z: lz},
                        yawQuarter: (((rule.yawQuarter ?? 0) - host.yawQuarter) % 4 + 4) % 4,
                    })
                    break
                }
            }
            occupied.push(position)
            placed++
        }
        if (placed === 0) {
            diagnostics.push({
                severity: 'warning',
                code: 'population.empty',
                message: '人口规则未能找到合法放置点',
                ruleId: rule.id,
            })
        }
    }

    return {spawns, diagnostics}
}
