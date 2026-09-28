import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import type {BuildingConfig} from '../validation.ts'
import {createRng} from './rng.ts'
import {corridor, dougong, floorSlab, pillar, pitchedRoof, spiralStairs, stairs} from './architecture.ts'

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

/** 平房：木地板 + 砖墙 + 岩石角柱 + 瓦顶，带门洞与窗洞 */
const house: GeneratorFn = (config, writer) => {
    const {sizeX: sx, sizeZ: sz} = config
    const sy = Math.max(3, config.sizeY)
    const rng = createRng(config.seed)

    fillBox(writer, 0, 0, 0, sx - 1, 0, sz - 1, 'wood')
    wallPerimeter(writer, sx, sz, 1, sy - 2, 'brick')
    for (let y = 0; y < sy; y++) {
        writer.set(0, y, 0, 'rock')
        writer.set(sx - 1, y, 0, 'rock')
        writer.set(0, y, sz - 1, 'rock')
        writer.set(sx - 1, y, sz - 1, 'rock')
    }

    /* 门洞：正面（z=0）中央 */
    const doorX = Math.floor(sx / 2)
    for (let y = 1; y <= Math.min(2, sy - 2); y++) writer.clear(doorX, y, 0)

    /* 窗洞：四面各开一处（尺寸允许时） */
    if (sy >= 4) {
        const wy = 2
        if (sx >= 5) {
            const wx1 = 1 + Math.min(2, Math.floor(rng() * (sx - 4 + 1)))
            const wx2 = sx - 1 - wx1
            writer.clear(wx1, wy, 0)
            writer.clear(wx2, wy, 0)
        }
        if (sz >= 5) {
            const wz = 2 + Math.floor(rng() * (sz - 3))
            writer.clear(0, wy, wz)
            writer.clear(sx - 1, wy, wz)
        }
    }

    /* 瓦顶 */
    fillBox(writer, 0, sy - 1, 0, sx - 1, sy - 1, sz - 1, 'tile')
}

/** 塔楼：岩石外墙 + 多层木楼板 + 瓦顶 */
const tower: GeneratorFn = (config, writer) => {
    const {sizeX: sx, sizeZ: sz} = config
    const sy = Math.max(4, config.sizeY)
    fillBox(writer, 0, 0, 0, sx - 1, 0, sz - 1, 'wood')
    wallPerimeter(writer, sx, sz, 1, sy - 1, 'rock')
    for (let y = 3; y < sy - 1; y += 3) {
        fillBox(writer, 1, y, 1, sx - 2, y, sz - 2, 'wood')
    }
    fillBox(writer, 0, sy - 1, 0, sx - 1, sy - 1, sz - 1, 'tile')
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

/** 废墟：房屋骨架随机坍塌（种子化） */
const ruin: GeneratorFn = (config, writer) => {
    const {sizeX: sx, sizeZ: sz} = config
    const sy = Math.max(3, config.sizeY)
    const rng = createRng(config.seed)
    fillBox(writer, 0, 0, 0, sx - 1, 0, sz - 1, 'soil')
    wallPerimeter(writer, sx, sz, 1, sy - 2, 'brick')
    fillBox(writer, 0, sy - 1, 0, sx - 1, sy - 1, sz - 1, 'tile')
    for (let x = 0; x < sx; x++) {
        for (let y = 1; y < sy; y++) {
            for (let z = 0; z < sz; z++) {
                if (rng() < 0.4) writer.clear(x, y, z)
            }
        }
    }
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

/** 箱庭：台地 + 外墙 + 角塔 + 主楼 + 连廊 + 庭院 + 树石点缀（固定 40×40 布局） */
const garden: GeneratorFn = (config, writer) => {
    const S = 40
    const rng = createRng(config.seed)
    /* 台地 */
    fillBox(writer, -4, 0, -4, S + 3, 0, S + 3, 'rock')
    fillBox(writer, 0, 1, 0, S - 1, 1, S - 1, 'soil')
    /* 外墙（带垛口） */
    wallPerimeter(writer, S, S, 2, 5, 'rock')
    for (let x = 0; x < S; x += 3) {
        writer.set(x, 6, 0, 'rock')
        writer.set(x, 6, S - 1, 'rock')
        writer.set(0, 6, x, 'rock')
        writer.set(S - 1, 6, x, 'rock')
    }
    /* 四角塔 */
    for (const [cx, cz] of [[0, 0], [S - 2, 0], [0, S - 2], [S - 2, S - 2]] as const) {
        pillar(writer, cx, 0, cz, 9, 'brick', 3)
        pitchedRoof(writer, cx - 1, 9, cz - 1, 5, 5, 3, 'tile', 'x')
    }
    /* 中央主楼 */
    const keepX = Math.floor(S / 2) - 4
    const keepZ = Math.floor(S / 2) - 4
    floorSlab(writer, keepX, 2, keepZ, 9, 9, 'rock')
    wallPerimeter9(writer, keepX, keepZ, 3, 11, 'brick')
    for (let y = 5; y < 11; y += 3) fillBox(writer, keepX + 1, y, keepZ + 1, keepX + 7, y, keepZ + 7, 'wood')
    spiralStairs(writer, keepX + 4, 3, keepZ + 4, 2.5, 9, 'wood')
    const gateX = keepX + 4
    writer.clear(gateX, 3, keepZ)
    writer.clear(gateX, 4, keepZ)
    pitchedRoof(writer, keepX, 12, keepZ, 9, 9, 4, 'tile', 'x')
    /* 连廊：主楼 → 四角塔 */
    corridor(writer, keepX, keepZ + 4, 2, 4, 6, 2, 'wood')
    corridor(writer, keepX + 8, keepZ + 4, S - 3, 4, 6, 2, 'wood')
    corridor(writer, keepX + 4, keepZ, keepX + 4, 3, 6, 2, 'wood')
    corridor(writer, keepX + 4, keepZ + 8, keepX + 4, S - 4, 6, 2, 'wood')
    /* 庭院斗拱灯台与树木点缀 */
    for (let i = 0; i < 10; i++) {
        const px = 3 + Math.floor(rng() * (S - 6))
        const pz = 3 + Math.floor(rng() * (S - 6))
        /* 避开主楼区域 */
        if (px > keepX - 2 && px < keepX + 11 && pz > keepZ - 2 && pz < keepZ + 11) continue
        pillar(writer, px, 2, pz, 3, 'wood')
        dougong(writer, px, 5, pz, 'wood')
        writer.set(px, 8, pz, 'tile')
    }
}

/** 主楼 9×9 外墙（局部坐标偏移版，避开 wallPerimeter 从 0 起算） */
const wallPerimeter9 = (
    writer: BlockWriter, ox: number, oz: number, y0: number, y1: number, material: SurfaceMaterialId,
): void => {
    for (let y = y0; y <= y1; y++) {
        for (let i = 0; i < 9; i++) {
            writer.set(ox + i, y, oz, material)
            writer.set(ox + i, y, oz + 8, material)
            writer.set(ox, y, oz + i, material)
            writer.set(ox + 8, y, oz + i, material)
        }
    }
}

const RECIPES: Record<string, GeneratorFn> = {
    house, tower, wall, platform, ruin, tree,
    stairs: stairsRecipe,
    spiral_stairs: spiralStairsRecipe,
    bridge: bridgeRecipe,
    great_hall: greatHall,
    keep,
    garden,
}
/** 可用建筑配方 id 列表 */
export const BUILDING_RECIPE_IDS: readonly string[] = Object.keys(RECIPES)

/** 按配置生成建筑（未知配方回退 house） */
export const generateBuilding = (config: BuildingConfig, writer: BlockWriter): void => {
    const fn = RECIPES[config.recipe] ?? house
    fn(config, writer)
}
