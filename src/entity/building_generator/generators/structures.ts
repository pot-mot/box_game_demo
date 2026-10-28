import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import type {BuildingConfig} from '../validation.ts'
import {corridor, dougong, floorSlab, pillar, pitchedRoof, spiralStairs, stairs} from './architecture.ts'
import {writeDungeon} from './dungeon.ts'
import {generateRoomBuildingLayout, writeRoomBuilding, HOUSE_ROOM_OPTIONS, TOWER_ROOM_OPTIONS, RUIN_ROOM_OPTIONS} from './rooms.ts'

/** 体素写入器（生成器以局部坐标写入） */
export interface BlockWriter {
    set: (x: number, y: number, z: number, material: SurfaceMaterialId) => void
    clear: (x: number, y: number, z: number) => void
}

type GeneratorFn = (config: BuildingConfig, writer: BlockWriter) => void

/** 实心长方体（含边界，局部坐标） */
const fillBox = (
    writer: BlockWriter,
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    material: SurfaceMaterialId,
): void => {
    for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) writer.set(x, y, z, material)
        }
    }
}

/** 四周墙体（不含地板 / 屋顶） */
const wallPerimeter = (
    writer: BlockWriter, sx: number, sz: number, y0: number, y1: number, material: SurfaceMaterialId,
): void => {
    for (let y = y0; y <= y1; y++) {
        for (let x = 0; x < sx; x++) {
            writer.set(x, y, 0, material)
            writer.set(x, y, sz - 1, material)
        }
        for (let z = 0; z < sz; z++) {
            writer.set(0, y, z, material)
            writer.set(sx - 1, y, z, material)
        }
    }
}

/** 平房：不规则房间布局 + 随机地板高度 + 砖墙 + 天花板 + 门洞 */
const house: GeneratorFn = (config, writer) => {
    const layout = generateRoomBuildingLayout(config, HOUSE_ROOM_OPTIONS)
    writeRoomBuilding(config, writer, layout, HOUSE_ROOM_OPTIONS)
}

/** 塔楼：不规则房间布局 + 随机地板高度 + 高墙 + 天花板 */
const tower: GeneratorFn = (config, writer) => {
    const layout = generateRoomBuildingLayout(config, TOWER_ROOM_OPTIONS)
    writeRoomBuilding(config, writer, layout, TOWER_ROOM_OPTIONS)
}

/** 城墙：单层厚砖墙 + 岩石压顶 */
const wall: GeneratorFn = (config, writer) => {
    const {sizeX: sx} = config
    const sy = Math.max(2, config.sizeY)
    fillBox(writer, 0, 0, 0, sx - 1, sy - 1, 0, 'brick')
    fillBox(writer, 0, sy - 1, 0, sx - 1, sy - 1, 0, 'rock')
}

/** 平台：岩石地台 */
const platform: GeneratorFn = (config, writer) => {
    fillBox(writer, 0, 0, 0, config.sizeX - 1, 0, config.sizeZ - 1, 'rock')
}

/** 废墟：不规则房间骨架 + 随机坍塌（种子化） */
const ruin: GeneratorFn = (config, writer) => {
    const layout = generateRoomBuildingLayout(config, RUIN_ROOM_OPTIONS)
    writeRoomBuilding(config, writer, layout, RUIN_ROOM_OPTIONS)
}

/** 树：木干 + 织物冠 */
const tree: GeneratorFn = (config, writer) => {
    const {sizeX: sx, sizeZ: sz} = config
    const trunkH = Math.max(2, config.sizeY)
    const cx = Math.floor(sx / 2)
    const cz = Math.floor(sz / 2)
    for (let y = 0; y < trunkH; y++) writer.set(cx, y, cz, 'wood')
    const r = Math.max(1, Math.min(2, Math.floor(Math.min(sx, sz) / 3)))
    for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
            for (let dy = 0; dy <= r; dy++) {
                if (dx * dx + dz * dz + dy * dy <= r * r + 1) {
                    writer.set(cx + dx, trunkH - 1 + dy, cz + dz, 'cloth')
                }
            }
        }
    }
}

/** 直跑楼梯 */
const stairsRecipe: GeneratorFn = (config, writer) => {
    const steps = Math.max(2, config.sizeY)
    stairs(writer, 0, 0, 0, 0, steps, Math.max(1, Math.min(config.sizeX, 5)), 'brick')
}

/** 旋转楼梯 */
const spiralStairsRecipe: GeneratorFn = (config, writer) => {
    spiralStairs(writer, 0, 0, 0, Math.max(2, Math.min(config.sizeX, config.sizeZ) / 2), Math.max(4, config.sizeY), 'rock')
}

/** 廊桥：两端支柱 + 桥面 */
const bridgeRecipe: GeneratorFn = (config, writer) => {
    const span = Math.max(3, config.sizeX)
    const h = Math.max(2, config.sizeY)
    pillar(writer, 0, 0, 0, h, 'rock', 2)
    pillar(writer, span - 2, 0, 0, h, 'rock', 2)
    corridor(writer, 0, 0, span - 1, 0, h, Math.max(1, Math.min(config.sizeZ, 3)), 'wood')
}

/** 大殿：台基 + 柱列 + 斗拱檐 + 斜屋顶 */
const greatHall: GeneratorFn = (config, writer) => {
    const sx = Math.max(7, config.sizeX)
    const sz = Math.max(7, config.sizeZ)
    const sy = Math.max(6, config.sizeY)
    fillBox(writer, 0, 0, 0, sx - 1, 0, sz - 1, 'rock')
    floorSlab(writer, 1, 1, 1, sx - 2, sz - 2, 'wood')
    const wallH = sy - 3
    wallPerimeter(writer, sx, sz, 1, wallH, 'brick')
    /* 门洞 */
    const doorX = Math.floor(sx / 2)
    writer.clear(doorX, 1, 0)
    writer.clear(doorX, 2, 0)
    /* 柱与斗拱 */
    for (let x = 2; x < sx - 1; x += 3) {
        pillar(writer, x, 1, 1, wallH, 'wood')
        pillar(writer, x, 1, sz - 2, wallH, 'wood')
        dougong(writer, x, wallH + 1, 1, 'wood')
        dougong(writer, x, wallH + 1, sz - 2, 'wood')
    }
    pitchedRoof(writer, 0, wallH + 4, 0, sx, sz, Math.max(3, sy - wallH), 'tile', 'x')
}

/** 主楼：多层 + 内部螺旋梯 + 四角塔 + 屋顶 */
const keep: GeneratorFn = (config, writer) => {
    const sx = Math.max(9, config.sizeX)
    const sz = Math.max(9, config.sizeZ)
    const sy = Math.max(9, config.sizeY)
    fillBox(writer, 0, 0, 0, sx - 1, 0, sz - 1, 'rock')
    wallPerimeter(writer, sx, sz, 1, sy - 2, 'rock')
    for (let y = 4; y < sy - 2; y += 3) fillBox(writer, 1, y, 1, sx - 2, y, sz - 2, 'wood')
    /* 内部螺旋梯 */
    spiralStairs(writer, Math.floor(sx / 2), 1, Math.floor(sz / 2), 2.5, sy - 3, 'wood')
    /* 四角塔 */
    for (const [cx, cz] of [[0, 0], [sx - 1, 0], [0, sz - 1], [sx - 1, sz - 1]] as const) {
        pillar(writer, cx, 0, cz, sy - 1, 'brick', 2)
    }
    pitchedRoof(writer, 0, sy - 1, 0, sx, sz, 4, 'tile', 'z')
    /* 入口 */
    const doorX = Math.floor(sx / 2)
    writer.clear(doorX, 1, 0)
    writer.clear(doorX, 2, 0)
}

const dungeon: GeneratorFn = (config, writer) => {
    writeDungeon(config, writer)
}

const RECIPES: Record<string, GeneratorFn> = {
    house, tower, wall, platform, ruin, tree, dungeon,
    stairs: stairsRecipe,
    spiral_stairs: spiralStairsRecipe,
    bridge: bridgeRecipe,
    great_hall: greatHall,
    keep,
}
/** 可用建筑配方 id 列表 */
export const BUILDING_RECIPE_IDS: readonly string[] = Object.keys(RECIPES)

/** 按配置生成建筑（未知配方回退 house） */
export const generateBuilding = (config: BuildingConfig, writer: BlockWriter): void => {
    const fn = RECIPES[config.recipe] ?? house
    fn(config, writer)
}
