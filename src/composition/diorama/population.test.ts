import {describe, it, expect} from 'vitest'
import {generatePopulation} from './population.ts'
import {solveDioramaPlan} from './plan.ts'
import {DIORAMA_BLUEPRINT_VERSION, type DioramaBlueprint} from './types.ts'

const blueprint = (): DioramaBlueprint => ({
    version: DIORAMA_BLUEPRINT_VERSION,
    recipeId: 'test',
    seed: 7,
    nodes: [
        {
            kind: 'terrain',
            nodeId: 'ground',
            position: [-8, 0, -8],
            yawQuarter: 0,
            config: {gridSize: 16, cellSize: 1, minHeight: 0, maxHeight: 0, friction: 0.3, generatorId: 'flat'},
        },
        {
            kind: 'building',
            nodeId: 'house',
            position: [-4, 0, -4],
            yawQuarter: 0,
            config: {recipe: 'house', seed: 1, sizeX: 8, sizeY: 5, sizeZ: 8},
        },
    ],
    population: [{
        id: 'crates',
        kind: 'box',
        zoneId: '',
        placement: 'ground',
        count: 3,
        minSpacing: 1,
        config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, material: 'wood'},
    }],
})

describe('规则式人口生成', () => {
    it('同种子结果确定', () => {
        const first = generatePopulation(blueprint(), solveDioramaPlan(blueprint()))
        const second = generatePopulation(blueprint(), solveDioramaPlan(blueprint()))
        expect(first.spawns).toEqual(second.spawns)
    })

    it('避开建筑足迹', () => {
        const plan = solveDioramaPlan(blueprint())
        const result = generatePopulation(blueprint(), plan)
        const house = plan.footprints.find(item => item.nodeId === 'house')!
        for (const spawn of result.spawns) {
            const position = 'position' in spawn ? spawn.position : spawn.localPosition
            const inside = position.x >= house.minX && position.x <= house.maxX &&
                position.z >= house.minZ && position.z <= house.maxZ
            expect(inside).toBe(false)
        }
    })

    it('数量受 count 限制', () => {
        const result = generatePopulation(blueprint(), solveDioramaPlan(blueprint()))
        expect(result.spawns.length).toBe(3)
    })

    it('屋顶规则缺省使用建筑 roof 锚点', () => {
        const base = blueprint()
        const withRoof: DioramaBlueprint = {
            ...base,
            population: [{
                id: 'roof_crates',
                kind: 'box',
                zoneId: 'house',
                placement: 'roof',
                count: 1,
                config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, material: 'wood'},
            }],
        }
        const result = generatePopulation(withRoof, solveDioramaPlan(withRoof))
        expect(result.spawns.length).toBe(1)
        const spawn = result.spawns[0]
        if (spawn.kind !== 'box') throw new Error('kind')
        /* house sizeY=5 → 屋顶锚点 y=4，箱子中心 +0.5 */
        expect(spawn.position.y).toBeCloseTo(4.5)
        expect(spawn.ownerNodeId).toBe('house')
    })
})
