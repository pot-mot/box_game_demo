import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import type {BuildingConfig} from '../validation.ts'
import {createRng} from './rng.ts'
import type {BlockWriter} from './structures.ts'

/** 基础房间生成：不规则闭合折线 + 随机地板高度 + 墙 + 天花板 */

export interface RoomBuildingOptions {
    /** 目标房间数量（受建筑尺寸限制会自动减少） */
    readonly roomCount: number
    /** 单层地板高度随机范围（0..floorRange 格） */
    readonly floorRange: number
    readonly wallMaterial: SurfaceMaterialId
    readonly floorMaterial: SurfaceMaterialId
    readonly ceilingMaterial: SurfaceMaterialId
    /** 是否在核心房间正面生成门洞 */
    readonly door?: boolean
    /** 废墟化：随机移除墙体 / 天花板的比例（0 表示完整建筑） */
    readonly ruinRatio?: number
}

export const HOUSE_ROOM_OPTIONS: RoomBuildingOptions = {
    roomCount: 2,
    floorRange: 1,
    wallMaterial: 'brick',
    floorMaterial: 'wood',
    ceilingMaterial: 'tile',
    door: true,
}

export const TOWER_ROOM_OPTIONS: RoomBuildingOptions = {
    roomCount: 2,
    floorRange: 1,
    wallMaterial: 'rock',
    floorMaterial: 'wood',
    ceilingMaterial: 'tile',
    door: true,
}

export const RUIN_ROOM_OPTIONS: RoomBuildingOptions = {
    roomCount: 3,
    floorRange: 1,
    wallMaterial: 'brick',
    floorMaterial: 'soil',
    ceilingMaterial: 'tile',
    door: false,
    ruinRatio: 0.35,
}

export interface RoomPlan {
    readonly id: string
    readonly cells: Set<string>
    readonly list: Array<readonly [number, number]>
    readonly floorY: number
    readonly centerX: number
    readonly centerZ: number
}

export interface RoomDoorPlan {
    readonly x: number
    readonly z: number
    readonly floorY: number
    readonly width: number
    readonly dir: '-z'
}

export interface RoomAnchorPlan {
    readonly id: string
    readonly position: readonly [number, number, number]
    readonly dir: '+x' | '-x' | '+z' | '-z'
}

export interface RoomBuildingLayout {
    readonly rooms: readonly RoomPlan[]
    readonly door: RoomDoorPlan | undefined
    readonly anchors: readonly RoomAnchorPlan[]
}

const key = (x: number, z: number): string => `${x},${z}`

const addRect = (cells: Set<string>, x0: number, z0: number, width: number, height: number): void => {
    for (let x = x0; x < x0 + width; x++) {
        for (let z = z0; z < z0 + height; z++) cells.add(key(x, z))
    }
}

const makeIrregular = (
    rng: () => number,
    sizeX: number,
    sizeZ: number,
    x0: number,
    z0: number,
    width: number,
    height: number,
    irregular: boolean,
): Set<string> => {
    const cells = new Set<string>()
    addRect(cells, x0, z0, width, height)
    const extensions = irregular ? 1 + Math.floor(rng() * 2) : 0
    for (let i = 0; i < extensions; i++) {
        const side = Math.floor(rng() * 4)
        const ew = 2 + Math.floor(rng() * 3)
        const eh = 2 + Math.floor(rng() * 3)
        const offset = Math.floor(rng() * Math.max(1, Math.min(width, height) - 1))
        if (side === 0) {
            const x = x0 + width
            const z = z0 + offset
            if (x + ew - 1 < sizeX - 1 && z + eh - 1 < sizeZ - 1) addRect(cells, x, z, ew, eh)
        } else if (side === 1) {
            const x = x0 - ew
            const z = z0 + offset
            if (x >= 1 && z + eh - 1 < sizeZ - 1) addRect(cells, x, z, ew, eh)
        } else if (side === 2) {
            const x = x0 + offset
            const z = z0 + height
            if (x + ew - 1 < sizeX - 1 && z + eh - 1 < sizeZ - 1) addRect(cells, x, z, ew, eh)
        } else {
            const x = x0 + offset
            const z = z0 - eh
            if (x + ew - 1 < sizeX - 1 && z >= 1) addRect(cells, x, z, ew, eh)
        }
    }
    return cells
}

const toList = (cells: Set<string>): Array<readonly [number, number]> => {
    const list: Array<readonly [number, number]> = []
    for (const value of cells) {
        const [x, z] = value.split(',').map(Number)
        list.push([x, z])
    }
    return list
}

const centerOf = (list: ReadonlyArray<readonly [number, number]>): readonly [number, number] => {
    let sx = 0
    let sz = 0
    for (const [x, z] of list) {
        sx += x
        sz += z
    }
    return list.length === 0 ? [0, 0] : [sx / list.length, sz / list.length]
}

const overlaps = (cells: Set<string>, occupied: ReadonlySet<string>): boolean => {
    for (const cell of cells) if (occupied.has(cell)) return true
    return false
}

const findFrontDoor = (room: RoomPlan): RoomDoorPlan | undefined => {
    const frontZ = Math.min(...room.list.map(([, z]) => z))
    const candidates = room.list
        .filter(([x, z]) => z === frontZ && !room.cells.has(key(x, z - 1)))
        .sort((a, b) => a[0] - b[0])
    if (candidates.length === 0) return undefined
    const [x, z] = candidates[Math.floor(candidates.length / 2)]
    return {x, z, floorY: room.floorY, width: 1, dir: '-z'}
}

/** 为 house / tower / ruin 等基础建筑生成不规则房间布局 */
export const generateRoomBuildingLayout = (
    config: BuildingConfig,
    options: RoomBuildingOptions,
): RoomBuildingLayout => {
    const sx = Math.max(3, config.sizeX)
    const sz = Math.max(3, config.sizeZ)
    const sy = Math.max(3, config.sizeY)
    const rng = createRng(config.seed)
    const usableArea = Math.max(1, (sx - 2) * (sz - 2))
    const maxRooms = Math.max(1, Math.min(options.roomCount, Math.floor(usableArea / 12)))
    const occupied = new Set<string>()
    const rooms: RoomPlan[] = []

    const createRoom = (
        x0: number,
        z0: number,
        width: number,
        height: number,
        id: string,
        irregular: boolean,
    ): RoomPlan | undefined => {
        if (width < 3 || height < 3) return undefined
        if (x0 < 1 || z0 < 1 || x0 + width > sx - 1 || z0 + height > sz - 1) return undefined
        const cells = makeIrregular(rng, sx, sz, x0, z0, width, height, irregular)
        if (overlaps(cells, occupied)) return undefined
        for (const cell of cells) occupied.add(cell)
        const list = toList(cells)
        const [centerX, centerZ] = centerOf(list)
        const floorY = Math.min(
            Math.floor(rng() * (Math.max(0, options.floorRange) + 1)),
            Math.max(0, sy - 3),
        )
        return {id, cells, list, floorY, centerX, centerZ}
    }

    for (let index = 0; index < maxRooms; index++) {
        const large = maxRooms === 1
        let room: RoomPlan | undefined
        if (index === 0 && !large) {
            /* 小建筑多房间：第一间固定落在一个角，保证后续房间有空间 */
            const width = 3
            const height = 3
            const corners: Array<readonly [number, number]> = [
                [1, 1],
                [Math.max(1, sx - width - 1), 1],
                [1, Math.max(1, sz - height - 1)],
                [Math.max(1, sx - width - 1), Math.max(1, sz - height - 1)],
            ]
            const startIndex = Math.floor(rng() * corners.length)
            for (let i = 0; i < corners.length && room === undefined; i++) {
                const [x0, z0] = corners[(startIndex + i) % corners.length]
                room = createRoom(x0, z0, width, height, `room_${index}`, false)
            }
        } else {
            const width = large ? Math.min(sx - 2, 4 + Math.floor(rng() * 3)) : 3
            const height = large ? Math.min(sz - 2, 4 + Math.floor(rng() * 3)) : 3
            for (let attempt = 0; attempt < 80 && room === undefined; attempt++) {
                const irregular = large || (index > 0 && attempt < 40)
                const x0 = 1 + Math.floor(rng() * Math.max(1, sx - width - 2))
                const z0 = 1 + Math.floor(rng() * Math.max(1, sz - height - 2))
                room = createRoom(x0, z0, width, height, `room_${index}`, irregular)
            }
            /* 随机落位失败时按网格扫描，保证小建筑也能有多个房间 */
            if (room === undefined) {
                for (let x0 = 1; x0 + width <= sx - 1 && room === undefined; x0 += width) {
                    for (let z0 = 1; z0 + height <= sz - 1 && room === undefined; z0 += height) {
                        room = createRoom(x0, z0, width, height, `room_${index}`, false)
                    }
                }
            }
        }
        if (room !== undefined) rooms.push(room)
    }

    const firstRoom = rooms[0]
    const door = options.door === true && firstRoom !== undefined ? findFrontDoor(firstRoom) : undefined
    const anchors: RoomAnchorPlan[] = []
    if (door !== undefined) {
        anchors.push({id: 'door', position: [door.x + 0.5, door.floorY, door.z + 0.5], dir: '-z'})
        anchors.push({id: 'back', position: [door.x + 0.5, door.floorY, sz - 1], dir: '+z'})
    }
    for (const room of rooms) {
        anchors.push({id: room.id, position: [room.centerX, room.floorY, room.centerZ], dir: '+z'})
        anchors.push({id: `interior_${room.id}`, position: [room.centerX, room.floorY, room.centerZ], dir: '+z'})
        anchors.push({id: `roof_${room.id}`, position: [room.centerX, sy - 1, room.centerZ], dir: '+z'})
    }
    if (rooms.length > 0) {
        const center = rooms[0]
        anchors.push({id: 'interior', position: [center.centerX, center.floorY, center.centerZ], dir: '+z'})
        anchors.push({id: 'roof', position: [center.centerX, sy - 1, center.centerZ], dir: '+z'})
    }

    return {rooms, door, anchors}
}

const isBoundary = (room: RoomPlan, x: number, z: number): boolean =>
    !room.cells.has(key(x + 1, z)) ||
    !room.cells.has(key(x - 1, z)) ||
    !room.cells.has(key(x, z + 1)) ||
    !room.cells.has(key(x, z - 1))

/** 写入房间地板 / 边界墙 / 天花板，并处理门洞与废墟化 */
export const writeRoomBuilding = (
    config: BuildingConfig,
    writer: BlockWriter,
    layout: RoomBuildingLayout,
    options: RoomBuildingOptions,
): void => {
    const sy = Math.max(3, config.sizeY)
    const rng = createRng(config.seed ^ 0x9e3779b9)
    const ceilingY = sy - 1
    for (const room of layout.rooms) {
        for (const [x, z] of room.list) {
            writer.set(x, room.floorY - 1, z, options.floorMaterial)
            writer.set(x, ceilingY, z, options.ceilingMaterial)
            if (isBoundary(room, x, z)) {
                for (let y = room.floorY; y < ceilingY; y++) writer.set(x, y, z, options.wallMaterial)
            } else {
                for (let y = room.floorY; y < ceilingY; y++) writer.clear(x, y, z)
            }
        }
    }

    if (layout.door !== undefined) {
        for (let dy = 0; dy < 2; dy++) writer.clear(layout.door.x, layout.door.floorY + dy, layout.door.z)
    }

    const ruin = options.ruinRatio ?? 0
    if (ruin > 0) {
        for (const room of layout.rooms) {
            for (const [x, z] of room.list) {
                if (isBoundary(room, x, z)) {
                    for (let y = room.floorY; y < ceilingY; y++) {
                        if (rng() < ruin) writer.clear(x, y, z)
                    }
                }
                if (rng() < ruin * 0.6) writer.clear(x, ceilingY, z)
            }
        }
    }
}
