import {describe, it, expect} from 'vitest'
import {hasErrors, validateBlueprint} from './blueprint.ts'
import {createFortressBlueprint} from './recipes/fortress.ts'
import {DIORAMA_BLUEPRINT_VERSION, type DioramaBlueprint} from './types.ts'

const blueprintOf = (): DioramaBlueprint => ({
    version: DIORAMA_BLUEPRINT_VERSION,
    recipeId: 'test',
    seed: 1,
    nodes: [
        {
            kind: 'building',
            nodeId: 'house',
            position: [0, 0, 0],
            yawQuarter: 0,
            config: {recipe: 'house', seed: 1, sizeX: 8, sizeY: 5, sizeZ: 8},
        },
    ],
    population: [],
})

describe('箱庭蓝图校验', () => {
    it('示例配方通过校验', () => {
        const diagnostics = validateBlueprint(createFortressBlueprint(42))
        expect(hasErrors(diagnostics)).toBe(false)
    })

    it('节点 id 重复报错', () => {
        const blueprint = blueprintOf()
        const diagnostics = validateBlueprint({
            ...blueprint,
            nodes: [blueprint.nodes[0], blueprint.nodes[0]],
        })
        expect(diagnostics.some(item => item.code === 'node.duplicate')).toBe(true)
    })

    it('连接槽位缺失报错', () => {
        const blueprint = blueprintOf()
        const diagnostics = validateBlueprint({
            ...blueprint,
            nodes: [...blueprint.nodes, {
                kind: 'connection',
                nodeId: 'walkway',
                position: [0, 0, 0],
                yawQuarter: 0,
                connectionKind: 'corridor',
                fromNodeId: 'house',
                fromSlotId: 'missing',
                toNodeId: 'house',
                toSlotId: 'door',
                material: 'wood',
            }],
        })
        expect(diagnostics.some(item => item.code === 'connection.fromSlot')).toBe(true)
    })

    it('人口规则分区缺失报错', () => {
        const blueprint = blueprintOf()
        const diagnostics = validateBlueprint({
            ...blueprint,
            population: [{
                id: 'crates',
                kind: 'box',
                zoneId: 'missing',
                placement: 'ground',
                config: {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3, material: 'wood'},
            }],
        })
        expect(diagnostics.some(item => item.code === 'population.zone')).toBe(true)
    })
})
