import type {BuildingConfig} from '../validation.ts'
import {generateDungeonLayout} from './dungeon.ts'
import {generateRoomBuildingLayout, HOUSE_ROOM_OPTIONS, TOWER_ROOM_OPTIONS, RUIN_ROOM_OPTIONS} from './rooms.ts'

/** 世界局部坐标系中的连接锚点：位置 + 朝向 */
export interface BuildingAnchor {
    readonly id: string
    readonly position: [number, number, number]
    readonly dir: '+x' | '-x' | '+z' | '-z'
}

const center = (size: number): number => Math.floor(size / 2)

/**
 * 按配方向组合层提供默认连接锚点。
 * 锚点只描述位置与朝向，不承诺表面一定可站立；调用方需自行做足迹 / 重叠校验。
 */
export const buildingAnchors = (config: BuildingConfig): BuildingAnchor[] => {
    const sx = Math.max(1, config.sizeX)
    const sz = Math.max(1, config.sizeZ)
    const sy = Math.max(1, config.sizeY)
    const cx = center(sx)
    const cz = center(sz)
    switch (config.recipe) {
        case 'house':
            return generateRoomBuildingLayout(config, HOUSE_ROOM_OPTIONS).anchors.map(anchor => ({
                id: anchor.id,
                position: [anchor.position[0], anchor.position[1], anchor.position[2]],
                dir: anchor.dir,
            }))
        case 'great_hall':
            return [
                {id: 'door', position: [cx, 0, 0], dir: '-z'},
                {id: 'back', position: [cx, 0, sz - 1], dir: '+z'},
                {id: 'interior', position: [cx, 1, cz], dir: '+z'},
                {id: 'roof', position: [cx, Math.max(6, sy) - 1, cz], dir: '+z'},
            ]
        case 'keep':
            return [
                {id: 'gate', position: [cx, 0, 0], dir: '-z'},
                {id: 'tower_nw', position: [0, 0, 0], dir: '-x'},
                {id: 'tower_ne', position: [sx - 1, 0, 0], dir: '+x'},
                {id: 'tower_sw', position: [0, 0, sz - 1], dir: '-x'},
                {id: 'tower_se', position: [sx - 1, 0, sz - 1], dir: '+x'},
                {id: 'interior', position: [cx, 1, cz], dir: '+z'},
                {id: 'roof', position: [cx, Math.max(9, sy) - 1, cz], dir: '+z'},
            ]
        case 'tower':
            return generateRoomBuildingLayout(config, TOWER_ROOM_OPTIONS).anchors.map(anchor => ({
                id: anchor.id,
                position: [anchor.position[0], anchor.position[1], anchor.position[2]],
                dir: anchor.dir,
            }))
        case 'wall':
            return [
                {id: 'start', position: [0, 0, 0], dir: '-x'},
                {id: 'end', position: [sx - 1, 0, 0], dir: '+x'},
            ]
        case 'bridge':
            return [
                {id: 'start', position: [0, sy - 1, 0], dir: '-x'},
                {id: 'end', position: [sx - 1, sy - 1, 0], dir: '+x'},
            ]
        case 'stairs': {
            const steps = Math.max(2, config.sizeY)
            return [
                {id: 'bottom', position: [0, 0, 0], dir: '-x'},
                {id: 'top', position: [steps - 1, steps - 1, 0], dir: '+x'},
            ]
        }
        case 'spiral_stairs': {
            const rise = Math.max(4, config.sizeY)
            return [
                {id: 'bottom', position: [0, 0, 0], dir: '-z'},
                {id: 'top', position: [0, rise - 1, 0], dir: '+z'},
            ]
        }
        case 'platform':
            return [
                {id: 'center', position: [cx, 0, cz], dir: '+z'},
                {id: 'corner_nw', position: [0, 0, 0], dir: '-x'},
                {id: 'corner_se', position: [sx - 1, 0, sz - 1], dir: '+x'},
            ]
        case 'dungeon':
            return generateDungeonLayout(config).anchors.map(anchor => ({
                id: anchor.id,
                position: [anchor.position[0], anchor.position[1], anchor.position[2]],
                dir: anchor.dir,
            }))
        case 'ruin':
            return generateRoomBuildingLayout(config, RUIN_ROOM_OPTIONS).anchors.map(anchor => ({
                id: anchor.id,
                position: [anchor.position[0], anchor.position[1], anchor.position[2]],
                dir: anchor.dir,
            }))
        case 'tree':
        default:
            return [
                {id: 'center', position: [cx, 0, cz], dir: '+z'},
            ]
    }
}
