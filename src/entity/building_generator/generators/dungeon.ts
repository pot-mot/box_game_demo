import type {BuildingConfig} from '../validation.ts'
import type {BlockWriter} from './structures.ts'
import {spiralStairs} from './architecture.ts'
import {createRng} from './rng.ts'

/** 单层高度间隔（上下层底板之间的格数） */
const LEVEL_GAP = 10
/** 房间与地图边界的安全距离 */
const MARGIN = 3
/** 墙体材质 / 地板 / 天花板 */
const WALL_MATERIAL = 'brick' as const
const FLOOR_MATERIAL = 'rock' as const
const CEILING_MATERIAL = 'tile' as const

type Cell = readonly [number, number]
type Dir = '+x' | '-x' | '+z' | '-z'

const key = (x: number, z: number): string => `${x},${z}`
const inBounds = (size: number, x: number, z: number): boolean =>
    x >= MARGIN && x < size - MARGIN && z >= MARGIN && z < size - MARGIN

interface RoomDraft {
    readonly id: string
    readonly level: number
    readonly floorY: number
    readonly wallHeight: number
    readonly cells: Set<string>
    readonly list: Cell[]
    centerX: number
    centerZ: number
}

export type DungeonDoorKind = 'open' | 'single_door' | 'double_door' | 'gate'

export interface DungeonDoor {
    readonly id: string
    readonly anchorId: string
    readonly roomId: string
    readonly kind: DungeonDoorKind
    readonly width: number
    readonly height: number
    readonly spanAxis: 'x' | 'z'
    readonly dir: Dir
    readonly floorY: number
    /** 被清空的墙体格 */
    readonly cells: readonly Cell[]
    /** 墙外廊道起点格 */
    readonly outside: Cell
    /** 世界局部坐标（方块中心 / 门底边） */
    readonly position: readonly [number, number, number]
}

export interface DungeonElevator {
    readonly id: string
    readonly anchorId: string
    readonly channel: string
    readonly floorY: number
    readonly travel: number
    readonly position: readonly [number, number, number]
}

export interface DungeonSwitch {
    readonly id: string
    readonly anchorId: string
    readonly channel: string
    readonly floorY: number
    readonly position: readonly [number, number, number]
}

export interface DungeonSpiral {
    readonly id: string
    readonly x: number
    readonly z: number
    readonly floorY: number
    readonly rise: number
}

export interface DungeonAnchor {
    readonly id: string
    readonly position: readonly [number, number, number]
    readonly dir: Dir
}

export interface DungeonLayout {
    readonly size: number
    readonly levels: number
    readonly rooms: readonly RoomDraft[]
    readonly doors: readonly DungeonDoor[]
    readonly elevators: readonly DungeonElevator[]
    readonly switches: readonly DungeonSwitch[]
    readonly spirals: readonly DungeonSpiral[]
    readonly anchors: readonly DungeonAnchor[]
}

const addRect = (cells: Set<string>, x0: number, z0: number, width: number, height: number): void => {
    for (let x = x0; x < x0 + width; x++) {
        for (let z = z0; z < z0 + height; z++) cells.add(key(x, z))
    }
}

const toList = (cells: Set<string>): Cell[] => {
    const out: Cell[] = []
    for (const value of cells) {
        const [x, z] = value.split(',').map(Number)
        out.push([x, z])
    }
    return out
}

const refreshCenter = (room: RoomDraft): void => {
    let sx = 0
    let sz = 0
    for (const [x, z] of room.list) {
        sx += x
        sz += z
    }
    room.centerX = room.list.length === 0 ? 0 : sx / room.list.length
    room.centerZ = room.list.length === 0 ? 0 : sz / room.list.length
}

const overlaps = (cells: Set<string>, occupied: ReadonlySet<string>): boolean => {
    for (const cell of cells) if (occupied.has(cell)) return true
    return false
}

const addOccupied = (cells: Set<string>, occupied: Set<string>): void => {
    for (const cell of cells) occupied.add(cell)
}

/** 生成不规则房间：基础矩形 + 1~2 个附着的侧向矩形（L / T / 十字形） */
const makeRoomCells = (
    rng: () => number,
    size: number,
    baseX: number,
    baseZ: number,
    baseW: number,
    baseH: number,
): Set<string> => {
    const cells = new Set<string>()
    addRect(cells, baseX, baseZ, baseW, baseH)
    const extensions = 1 + Math.floor(rng() * 2)
    for (let i = 0; i < extensions; i++) {
        const side = Math.floor(rng() * 4)
        const spread = 2 + Math.floor(rng() * Math.max(1, Math.min(baseW, baseH) - 3))
        if (side === 0) {
            const w = 3 + Math.floor(rng() * 3)
            const h = 3 + Math.floor(rng() * 3)
            const x = baseX + baseW
            const z = baseZ + Math.min(baseH - 1, spread)
            if (inBounds(size, x + w - 1, z + h - 1) && inBounds(size, x, z)) addRect(cells, x, z, w, h)
        } else if (side === 1) {
            const w = 3 + Math.floor(rng() * 3)
            const h = 3 + Math.floor(rng() * 3)
            const x = baseX - w
            const z = baseZ + Math.min(baseH - 1, spread)
            if (inBounds(size, x, z) && inBounds(size, x + w - 1, z + h - 1)) addRect(cells, x, z, w, h)
        } else if (side === 2) {
            const w = 3 + Math.floor(rng() * 3)
            const h = 3 + Math.floor(rng() * 3)
            const x = baseX + Math.min(baseW - 1, spread)
            const z = baseZ + baseH
            if (inBounds(size, x, z) && inBounds(size, x + w - 1, z + h - 1)) addRect(cells, x, z, w, h)
        } else {
            const w = 3 + Math.floor(rng() * 3)
            const h = 3 + Math.floor(rng() * 3)
            const x = baseX + Math.min(baseW - 1, spread)
            const z = baseZ - h
            if (inBounds(size, x, z) && inBounds(size, x + w - 1, z + h - 1)) addRect(cells, x, z, w, h)
        }
    }
    return cells
}

const isBoundary = (room: RoomDraft, x: number, z: number): boolean =>
    !room.cells.has(key(x + 1, z)) ||
    !room.cells.has(key(x - 1, z)) ||
    !room.cells.has(key(x, z + 1)) ||
    !room.cells.has(key(x, z - 1))

interface WallRun {
    readonly dir: Dir
    readonly cells: Cell[]
    readonly spanAxis: 'x' | 'z'
    readonly outside: Cell
}

/** 在房间朝向目标的一侧寻找一段连续墙面（长度 = min(desiredWidth, 可用长度)） */
const findWallRun = (
    room: RoomDraft,
    targetX: number,
    targetZ: number,
    desiredWidth: number,
    otherRoomCells: ReadonlySet<string>,
): WallRun | undefined => {
    const dx = targetX - room.centerX
    const dz = targetZ - room.centerZ
    const dirs: Dir[] = Math.abs(dx) >= Math.abs(dz)
        ? [dx >= 0 ? '+x' : '-x', dz >= 0 ? '+z' : '-z', dx >= 0 ? '-x' : '+x', dz >= 0 ? '-z' : '+z']
        : [dz >= 0 ? '+z' : '-z', dx >= 0 ? '+x' : '-x', dz >= 0 ? '-z' : '+z', dx >= 0 ? '-x' : '+x']

    for (const dir of dirs) {
        const bySpan = new Map<number, number>()
        for (const [x, z] of room.list) {
            let outsideX = x
            let outsideZ = z
            let span = 0
            if (dir === '+x') { outsideX = x + 1; span = z }
            else if (dir === '-x') { outsideX = x - 1; span = z }
            else if (dir === '+z') { outsideZ = z + 1; span = x }
            else { outsideZ = z - 1; span = x }
            if (!room.cells.has(key(outsideX, outsideZ)) && !otherRoomCells.has(key(outsideX, outsideZ))) {
                const previous = bySpan.get(span)
                const wall = dir === '+x' || dir === '-x' ? x : z
                if (previous === undefined || (dir === '+x' ? wall > previous : wall < previous)) {
                    bySpan.set(span, wall)
                }
            }
        }
        const spans = [...bySpan.keys()].sort((a, b) => a - b)
        const runs: number[][] = []
        let run: number[] = []
        for (const span of spans) {
            if (run.length === 0 || span === run[run.length - 1] + 1) run.push(span)
            else {
                if (run.length > 0) runs.push(run)
                run = [span]
            }
        }
        if (run.length > 0) runs.push(run)

        const targetSpan = dir === '+x' || dir === '-x' ? targetZ : targetX
        let best: {run: number[]; width: number; distance: number} | undefined
        for (const candidate of runs) {
            const width = Math.min(desiredWidth, candidate.length)
            if (width <= 0) continue
            /* 在连续墙段中取最靠近目标坐标的一段 */
            let bestStart = 0
            let bestDistance = Number.POSITIVE_INFINITY
            for (let start = 0; start + width <= candidate.length; start++) {
                const centerSpan = (candidate[start] + candidate[start + width - 1]) / 2
                const distance = Math.abs(centerSpan - targetSpan)
                if (distance < bestDistance) {
                    bestDistance = distance
                    bestStart = start
                }
            }
            if (best === undefined || bestDistance < best.distance) {
                best = {run: candidate.slice(bestStart, bestStart + width), width, distance: bestDistance}
            }
        }
        if (best !== undefined) {
            const cells = best.run.map(span => {
                const wall = bySpan.get(span) ?? 0
                return (dir === '+x' || dir === '-x' ? [wall, span] : [span, wall]) as Cell
            })
            const outside: Cell = (() => {
                const first = cells[0]
                const dirValues = cells.map(cell => {
                    if (dir === '+x') return [cell[0] + 1, cell[1]] as Cell
                    if (dir === '-x') return [cell[0] - 1, cell[1]] as Cell
                    if (dir === '+z') return [cell[0], cell[1] + 1] as Cell
                    return [cell[0], cell[1] - 1] as Cell
                })
                return dirValues[Math.floor(dirValues.length / 2)] ?? first
            })()
            return {
                dir,
                cells,
                spanAxis: dir === '+x' || dir === '-x' ? 'z' : 'x',
                outside,
            }
        }
    }
    return undefined
}

const doorSpec = (
    id: string,
    room: RoomDraft,
    run: WallRun,
    rng: () => number,
): DungeonDoor => {
    const kind: DungeonDoorKind = run.cells.length >= 3
        ? 'gate'
        : run.cells.length === 2
            ? (rng() < 0.35 ? 'open' : 'double_door')
            : (rng() < 0.4 ? 'open' : 'single_door')
    const height = 2
    const xs = run.cells.map(cell => cell[0])
    const zs = run.cells.map(cell => cell[1])
    const centerX = (Math.min(...xs) + Math.max(...xs) + 1) / 2
    const centerZ = (Math.min(...zs) + Math.max(...zs) + 1) / 2
    return {
        id,
        anchorId: `door_${id}`,
        roomId: room.id,
        kind,
        width: run.cells.length,
        height,
        spanAxis: run.spanAxis,
        dir: run.dir,
        floorY: room.floorY,
        cells: run.cells,
        outside: run.outside,
        position: [centerX, room.floorY, centerZ],
    }
}

/** 生成箱庭/地牢布局：房间、连接、开口、垂直交通与交互锚点 */
export const generateDungeonLayout = (config: BuildingConfig): DungeonLayout => {
    const size = Math.max(24, Math.min(48, Math.min(config.sizeX, config.sizeZ)))
    const levels = Math.max(2, Math.min(3, Math.floor(config.sizeY / 9)))
    const rng = createRng(config.seed)

    const rooms: RoomDraft[] = []
    for (let level = 0; level < levels; level++) {
        const occupied = new Set<string>()
        const levelRooms: RoomDraft[] = []
        /* 中心主室：保证每层中央有重叠面积，供垂直交通使用 */
        const coreW = 10
        const coreH = 10
        const coreCells = makeRoomCells(rng, size, Math.floor(size / 2) - coreW / 2, Math.floor(size / 2) - coreH / 2, coreW, coreH)
        addOccupied(coreCells, occupied)
        const core: RoomDraft = {
            id: `room_${level}_0`, level,
            floorY: level * LEVEL_GAP + 1 + Math.floor(rng() * 3),
            wallHeight: 3 + Math.floor(rng() * 2),
            cells: coreCells, list: toList(coreCells), centerX: 0, centerZ: 0,
        }
        refreshCenter(core)
        levelRooms.push(core)

        const targetRooms = 3 + Math.floor(rng() * 2)
        for (let attempt = 0; attempt < 40 && levelRooms.length < targetRooms; attempt++) {
            const w = 6 + Math.floor(rng() * 4)
            const h = 6 + Math.floor(rng() * 4)
            const x = MARGIN + Math.floor(rng() * Math.max(1, size - MARGIN * 2 - w))
            const z = MARGIN + Math.floor(rng() * Math.max(1, size - MARGIN * 2 - h))
            const cells = makeRoomCells(rng, size, x, z, w, h)
            if (overlaps(cells, occupied)) continue
            addOccupied(cells, occupied)
            const room: RoomDraft = {
                id: `room_${level}_${levelRooms.length}`,
                level,
                floorY: level * LEVEL_GAP + 1 + Math.floor(rng() * 3),
                wallHeight: 3 + Math.floor(rng() * 2),
                cells,
                list: toList(cells),
                centerX: 0,
                centerZ: 0,
            }
            refreshCenter(room)
            levelRooms.push(room)
        }
        rooms.push(...levelRooms)
    }

    const doors: DungeonDoor[] = []
    let doorCounter = 0
    const connect = (a: RoomDraft, b: RoomDraft): void => {
        const desiredWidth = Math.min(3, 1 + Math.floor(rng() * 3))
        const runA = findWallRun(a, b.centerX, b.centerZ, desiredWidth, b.cells)
        const runB = findWallRun(b, a.centerX, a.centerZ, desiredWidth, a.cells)
        if (runA === undefined || runB === undefined) return
        const doorA = doorSpec(`${doorCounter}_a`, a, runA, rng)
        doorCounter++
        const doorB = doorSpec(`${doorCounter}_b`, b, runB, rng)
        doorCounter++
        doors.push(doorA, doorB)
    }

    for (let level = 0; level < levels; level++) {
        const levelRooms = rooms.filter(room => room.level === level)
        const core = levelRooms[0]
        if (core === undefined) continue
        for (let i = 1; i < levelRooms.length; i++) connect(core, levelRooms[i])
    }

    const elevators: DungeonElevator[] = []
    const switches: DungeonSwitch[] = []
    const spirals: DungeonSpiral[] = []
    let verticalCounter = 0

    for (let level = 0; level < levels - 1; level++) {
        const lowerRooms = rooms.filter(room => room.level === level)
        const upperRooms = rooms.filter(room => room.level === level + 1)
        let best: {lower: RoomDraft; upper: RoomDraft; cells: Cell[]} | undefined
        for (const lower of lowerRooms) {
            for (const upper of upperRooms) {
                const overlap = lower.list.filter(([x, z]) => upper.cells.has(key(x, z)))
                if (best === undefined || overlap.length > best.cells.length) best = {lower, upper, cells: overlap}
            }
        }
        if (best === undefined || best.cells.length === 0) continue
        const useSpiral = (config.seed + level) % 2 === 0
        const center = best.cells[Math.floor(best.cells.length / 2)]
        if (useSpiral) {
            spirals.push({
                id: `spiral_${verticalCounter}`,
                x: center[0],
                z: center[1],
                floorY: best.lower.floorY,
                rise: Math.max(4, best.upper.floorY - best.lower.floorY + 1),
            })
        } else {
            const channel = `dungeon_elev_${config.seed}_${level}`
            const elevatorId = `elev_${verticalCounter}`
            const switchLowerId = `switch_${verticalCounter}_lower`
            const switchUpperId = `switch_${verticalCounter}_upper`
            const lowerCenter = best.cells[Math.floor(best.cells.length / 2)]
            elevators.push({
                id: elevatorId,
                anchorId: `elev_${verticalCounter}`,
                channel,
                floorY: best.lower.floorY,
                travel: Math.max(1, best.upper.floorY - best.lower.floorY),
                position: [lowerCenter[0] + 0.5, best.lower.floorY, lowerCenter[1] + 0.5],
            })
            const switchOffset: Cell = [lowerCenter[0] + 3, lowerCenter[1]]
            switches.push({
                id: switchLowerId,
                anchorId: `switch_${verticalCounter}_lower`,
                channel,
                floorY: best.lower.floorY,
                position: [switchOffset[0] + 0.5, best.lower.floorY, switchOffset[1] + 0.5],
            })
            switches.push({
                id: switchUpperId,
                anchorId: `switch_${verticalCounter}_upper`,
                channel,
                floorY: best.upper.floorY,
                position: [switchOffset[0] + 0.5, best.upper.floorY, switchOffset[1] + 0.5],
            })
        }
        verticalCounter++
    }

    const anchors: DungeonAnchor[] = []
    for (const door of doors) {
        if (door.kind === 'open') continue
        anchors.push({id: door.anchorId, position: door.position, dir: '-z'})
    }
    for (const elevator of elevators) anchors.push({id: elevator.anchorId, position: elevator.position, dir: '-z'})
    for (const sw of switches) anchors.push({id: sw.anchorId, position: sw.position, dir: '-z'})
    for (const room of rooms) {
        anchors.push({
            id: room.id,
            position: [room.centerX, room.floorY, room.centerZ],
            dir: '+z',
        })
    }

    return {size, levels, rooms, doors, elevators, switches, spirals, anchors}
}

const writeRoom = (writer: BlockWriter, room: RoomDraft): void => {
    const ceilingY = room.floorY + room.wallHeight
    for (const [x, z] of room.list) {
        writer.set(x, room.floorY - 1, z, FLOOR_MATERIAL)
        writer.set(x, ceilingY, z, CEILING_MATERIAL)
        if (isBoundary(room, x, z)) {
            for (let y = room.floorY; y < ceilingY; y++) writer.set(x, y, z, WALL_MATERIAL)
        } else {
            for (let y = room.floorY; y < ceilingY; y++) writer.clear(x, y, z)
        }
    }
}

/** 按布局写入完整地牢体素（房间 / 廊道 / 楼梯 / 开口 / 竖井） */
export const writeDungeon = (config: BuildingConfig, writer: BlockWriter): void => {
    const layout = generateDungeonLayout(config)
    for (const room of layout.rooms) writeRoom(writer, room)

    /* 开口清空：先清出墙洞，再让廊道从外侧接入 */
    for (const door of layout.doors) {
        const room = layout.rooms.find(item => item.id === door.roomId)
        if (room === undefined) continue
        for (const [x, z] of door.cells) {
            for (let dy = 0; dy < door.height; dy++) writer.clear(x, room.floorY + dy, z)
        }
    }

    /* 廊道：每个连接两端开口外侧之间铺一条带侧墙 / 天花板的隧道 */
    const connections = new Map<string, {a: DungeonDoor; b: DungeonDoor}>()
    for (const door of layout.doors) {
        const group = door.id.split('_')[0]
        const entry = connections.get(group) ?? {a: door, b: door}
        if (entry.a === door) entry.a = door
        else entry.b = door
        connections.set(group, entry)
    }
    for (const {a, b} of connections.values()) {
        if (a === b) continue
        const startX = a.outside[0]
        const startZ = a.outside[1]
        const endX = b.outside[0]
        const endZ = b.outside[1]
        const width = Math.max(a.width, b.width)
        const path: Cell[] = []
        let x = startX
        let z = startZ
        path.push([x, z])
        const stepX = Math.sign(endX - startX)
        while (x !== endX) {
            x += stepX
            path.push([x, z])
        }
        const stepZ = Math.sign(endZ - startZ)
        while (z !== endZ) {
            z += stepZ
            path.push([x, z])
        }
        const half = Math.floor((width - 1) / 2)
        const cells = new Map<string, number>()
        for (let i = 0; i < path.length; i++) {
            const t = path.length <= 1 ? 0 : i / (path.length - 1)
            const y = Math.round(a.floorY + (b.floorY - a.floorY) * t)
            const [px, pz] = path[i]
            for (let dx = -half; dx <= width - 1 - half; dx++) {
                for (let dz = -half; dz <= width - 1 - half; dz++) {
                    cells.set(key(px + dx, pz + dz), y)
                }
            }
        }
        for (const [cell, y] of cells) {
            const [cx, cz] = cell.split(',').map(Number)
            writer.set(cx, y - 1, cz, FLOOR_MATERIAL)
            writer.set(cx, y + 3, cz, CEILING_MATERIAL)
            for (let dy = 0; dy < 3; dy++) writer.clear(cx, y + dy, cz)
        }
        for (const [cell, y] of cells) {
            const [cx, cz] = cell.split(',').map(Number)
            const neighbors: Cell[] = [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]
            for (const [nx, nz] of neighbors) {
                if (!cells.has(key(nx, nz))) {
                    for (let dy = 0; dy < 3; dy++) writer.set(cx, y + dy, cz, WALL_MATERIAL)
                    break
                }
            }
        }
    }

    /* 螺旋楼梯竖井 */
    for (const spiral of layout.spirals) {
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                for (let y = spiral.floorY - 1; y <= spiral.floorY + spiral.rise + 3; y++) {
                    writer.clear(spiral.x + dx, y, spiral.z + dz)
                }
            }
        }
        spiralStairs(writer, spiral.x, spiral.floorY, spiral.z, 2, spiral.rise, WALL_MATERIAL)
    }

    /* 升降梯竖井 + 开关位置清空 */
    for (const elevator of layout.elevators) {
        const x = Math.floor(elevator.position[0])
        const z = Math.floor(elevator.position[2])
        const upper = elevator.floorY + elevator.travel
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                for (let y = elevator.floorY - 1; y <= upper + 3; y++) writer.clear(x + dx, y, z + dz)
            }
        }
    }

    /* 最后再清一次门洞与门外一格：廊道侧墙不得挡住通行 */
    for (const door of layout.doors) {
        for (const [x, z] of door.cells) {
            for (let dy = 0; dy < door.height; dy++) writer.clear(x, door.floorY + dy, z)
            const outsideX = door.dir === '+x' ? x + 1 : door.dir === '-x' ? x - 1 : x
            const outsideZ = door.dir === '+z' ? z + 1 : door.dir === '-z' ? z - 1 : z
            for (let dy = 0; dy < door.height; dy++) writer.clear(outsideX, door.floorY + dy, outsideZ)
        }
    }
}
