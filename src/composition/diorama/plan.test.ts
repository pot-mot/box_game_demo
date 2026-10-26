import {describe, it, expect} from 'vitest'
import {solveDioramaPlan} from './plan.ts'
import {DIORAMA_BLUEPRINT_VERSION, type DioramaBlueprint} from './types.ts'

const houseNode = (nodeId: string, position: readonly [number, number, number], yawQuarter: number) => ({
    kind: 'building' as const,
    nodeId,
    position,
    yawQuarter,
    config: {recipe: 'house' as const, seed: 1, sizeX: 8, sizeY: 5, sizeZ: 8},
})

const blueprintWith = (nodes: DioramaBlueprint['nodes']): DioramaBlueprint => ({
    version: DIORAMA_BLUEPRINT_VERSION,
    recipeId: 'test',
    seed: 1,
    nodes,
    population: [],
})

describe('箱庭布局求解', () => {
    it('槽位随节点偏航旋转到世界坐标', () => {
        const plan = solveDioramaPlan(blueprintWith([houseNode('house', [0, 0, 0], 1)]))
        const door = plan.slots.get('house:door')
        expect(door).toBeDefined()
        expect(door!.position[0]).toBeCloseTo(0)
        expect(door!.position[2]).toBeCloseTo(4)
    })

    it('分组变换叠加到子节点', () => {
        const plan = solveDioramaPlan(blueprintWith([
            {
                kind: 'group',
                nodeId: 'g',
                position: [10, 0, 0],
                yawQuarter: 1,
                children: [houseNode('house', [2, 0, 0], 0)],
            },
        ]))
        const node = plan.nodes.find(item => item.node.nodeId === 'house')
        expect(node).toBeDefined()
        expect(node!.origin.x).toBeCloseTo(10)
        expect(node!.origin.z).toBeCloseTo(2)
        expect(node!.yawQuarter).toBe(1)
    })

    it('建筑足迹重叠报错', () => {
        const plan = solveDioramaPlan(blueprintWith([
            houseNode('a', [0, 0, 0], 0),
            houseNode('b', [4, 0, 0], 0),
        ]))
        expect(plan.diagnostics.some(item => item.code === 'plan.overlap')).toBe(true)
    })

    it('连接端点解析到槽位', () => {
        const plan = solveDioramaPlan(blueprintWith([
            houseNode('a', [0, 0, 0], 0),
            houseNode('b', [20, 0, 0], 0),
            {
                kind: 'connection',
                nodeId: 'walkway',
                position: [0, 0, 0],
                yawQuarter: 0,
                connectionKind: 'corridor',
                fromNodeId: 'a',
                fromSlotId: 'door',
                toNodeId: 'b',
                toSlotId: 'door',
                material: 'wood',
            },
        ]))
        expect(plan.connections.length).toBe(1)
        expect(plan.connections[0].from.position[0]).toBe(4)
        expect(plan.connections[0].to.position[0]).toBe(24)
    })
})
