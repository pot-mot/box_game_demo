import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import type {BuildingConfig} from '../validation.ts'
import {createRng} from './rng.ts'

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

const RECIPES: Record<string, GeneratorFn> = {house, tower, wall, platform, ruin, tree}

/** 可用建筑配方 id 列表 */
export const BUILDING_RECIPE_IDS: readonly string[] = Object.keys(RECIPES)

/** 按配置生成建筑（未知配方回退 house） */
export const generateBuilding = (config: BuildingConfig, writer: BlockWriter): void => {
    const fn = RECIPES[config.recipe] ?? house
    fn(config, writer)
}
