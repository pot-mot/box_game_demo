import type {InteractableConfig} from '../../../entity/interactable/types.ts'
import {generateDungeonLayout, type DungeonDoor} from '../../../entity/building_generator/types/index.ts'
import {DIORAMA_BLUEPRINT_VERSION, type DioramaBlueprint, type PopulationRule} from '../types.ts'

const DUNGEON_BUILDING = {
    recipe: 'dungeon',
    sizeX: 44,
    sizeY: 20,
    sizeZ: 44,
}

const doorConfig = (door: DungeonDoor): InteractableConfig => {
    const width = door.width
    const height = door.height
    const size = door.spanAxis === 'x'
        ? [width, height, 0.2] as [number, number, number]
        : [0.2, height, width] as [number, number, number]
    if (door.kind === 'gate') {
        return {kind: 'gate', material: 'rusty_iron', size, channel: '', travel: 2, speed: 2}
    }
    if (door.kind === 'double_door') {
        return {kind: 'push_door_double', material: 'wood', size, channel: '', hingeQuarter: 0}
    }
    return {kind: 'push_door_single', material: 'wood', size, channel: '', hingeQuarter: 0}
}

/** 复杂地牢箱庭：不规则房间 + 廊桥 / 楼梯 / 门闸 / 垂直交通 */
export const createDungeonBlueprint = (seed: number): DioramaBlueprint => {
    const config = {...DUNGEON_BUILDING, seed}
    const layout = generateDungeonLayout(config)
    const population: PopulationRule[] = []

    for (const door of layout.doors) {
        if (door.kind === 'open') continue
        population.push({
            id: `door_${door.id}`,
            kind: 'interactable',
            zoneId: 'dungeon',
            placement: 'anchor',
            anchorNodeId: 'dungeon',
            anchorSlotId: door.anchorId,
            count: 1,
            minSpacing: 0,
            config: doorConfig(door),
        })
    }

    for (const elevator of layout.elevators) {
        population.push({
            id: elevator.id,
            kind: 'interactable',
            zoneId: 'dungeon',
            placement: 'anchor',
            anchorNodeId: 'dungeon',
            anchorSlotId: elevator.anchorId,
            count: 1,
            minSpacing: 0,
            config: {
                kind: 'elevator',
                material: 'rusty_iron',
                size: [2, 0.2, 2],
                channel: elevator.channel,
                travel: elevator.travel,
                speed: 2,
            },
        })
    }

    for (const sw of layout.switches) {
        population.push({
            id: sw.id,
            kind: 'interactable',
            zoneId: 'dungeon',
            placement: 'anchor',
            anchorNodeId: 'dungeon',
            anchorSlotId: sw.anchorId,
            count: 1,
            minSpacing: 0,
            config: {
                kind: 'switch',
                material: 'rusty_iron',
                size: [0.5, 0.8, 0.3],
                channel: sw.channel,
                mode: 'toggle',
            },
        })
    }

    /* 每个房间中心放一盏灯笼，少量箱子点缀 */
    const rooms = layout.rooms
    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i]
        population.push({
            id: `lantern_${room.id}`,
            kind: 'decor',
            zoneId: 'dungeon',
            placement: 'anchor',
            anchorNodeId: 'dungeon',
            anchorSlotId: room.id,
            propKind: 'lantern',
            material: 'rusty_iron',
            yawQuarter: 0,
        })
        if ((seed + i) % 3 === 0) {
            population.push({
                id: `crate_${room.id}`,
                kind: 'box',
                zoneId: 'dungeon',
                placement: 'anchor',
                anchorNodeId: 'dungeon',
                anchorSlotId: room.id,
                count: 1,
                minSpacing: 0,
                config: {width: 0.8, height: 0.8, depth: 0.8, mass: 2, friction: 0.4, material: 'wood'},
            })
        }
    }

    return {
        version: DIORAMA_BLUEPRINT_VERSION,
        recipeId: 'dungeon',
        seed,
        nodes: [{
            kind: 'building',
            nodeId: 'dungeon',
            position: [0, 0, 0],
            yawQuarter: 0,
            config,
        }],
        population,
    }
}
