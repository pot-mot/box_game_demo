import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import type {BlockWriter} from './structures.ts'

/** 把局部 (x,z) 绕原点顺时针旋转 q*90° */
export const rotateQuarter = (x: number, z: number, q: number): [number, number] => {
    const k = ((q % 4) + 4) % 4
    const nx = (v: number): number => (v === 0 ? 0 : v)
    if (k === 0) return [x, z]
    if (k === 1) return [nx(-z), x]
    if (k === 2) return [nx(-x), nx(-z)]
    return [z, nx(-x)]
}

/** 旋转放置单个体素（q 为 90° 偏航次数） */
const put = (
    writer: BlockWriter,
    ox: number, oy: number, oz: number,
    q: number,
    lx: number, ly: number, lz: number,
    material: SurfaceMaterialId,
): void => {
    const [rx, rz] = rotateQuarter(lx, lz, q)
    writer.set(ox + rx, oy + ly, oz + rz, material)
}

/** 直跑楼梯：沿局部 +X 前进 steps 级，每级高 1、进深 run，宽度沿 Z */
export const stairs = (
    writer: BlockWriter, ox: number, oy: number, oz: number,
    dirQuarter: number, steps: number, width: number, material: SurfaceMaterialId, run = 1,
): void => {
    const half = Math.floor(width / 2)
    for (let i = 0; i < steps; i++) {
        const lx = i * run
        for (let w = -half; w <= half; w++) {
            put(writer, ox, oy, oz, dirQuarter, lx, i, w, material)
            /* 立面支撑 */
            if (i > 0) put(writer, ox, oy, oz, dirQuarter, lx, i - 1, w, material)
        }
    }
}

/** 旋转楼梯：极坐标逐层落体素，中央留空可另置柱 */
export const spiralStairs = (
    writer: BlockWriter, ox: number, oy: number, oz: number,
    radius: number, totalRise: number, material: SurfaceMaterialId,
): void => {
    const turns = 1
    for (let h = 0; h < totalRise; h++) {
        const ang = (h / Math.max(totalRise - 1, 1)) * Math.PI * 2 * turns
        const r = radius * (0.55 + 0.45 * h / Math.max(totalRise - 1, 1))
        const x = Math.round(Math.cos(ang) * r)
        const z = Math.round(Math.sin(ang) * r)
        /* 两级宽踏步，保证连续可攀爬 */
        writer.set(ox + x, oy + h, oz + z, material)
        writer.set(ox + x, oy + h, oz + z + 1, material)
    }
}

/** 支撑柱 */
export const pillar = (
    writer: BlockWriter, ox: number, oy: number, oz: number,
    height: number, material: SurfaceMaterialId, thick = 1,
): void => {
    for (let y = 0; y < height; y++) {
        for (let dx = 0; dx < thick; dx++) {
            for (let dz = 0; dz < thick; dz++) {
                writer.set(ox + dx, oy + y, oz + dz, material)
            }
        }
    }
}

/** 斗拱：柱顶 3×3 基座 + 交叉横拱 + 上层 3×3（檐下承托） */
export const dougong = (
    writer: BlockWriter, ox: number, oy: number, oz: number, material: SurfaceMaterialId,
): void => {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            writer.set(ox + dx, oy, oz + dz, material)
            writer.set(ox + dx, oy + 2, oz + dz, material)
        }
        writer.set(ox + dx, oy + 1, oz, material)
        writer.set(ox, oy + 1, oz + dx, material)
    }
}

/** 斜屋顶（悬山双坡）：ridgeAxis='x' 时屋脊沿 X、向 ±Z 下坡 */
export const pitchedRoof = (
    writer: BlockWriter, ox: number, oy: number, oz: number,
    sizeX: number, sizeZ: number, height: number,
    material: SurfaceMaterialId, ridgeAxis: 'x' | 'z' = 'x',
): void => {
    const steps = Math.max(1, height)
    const eave = 1
    for (let y = 0; y < steps; y++) {
        /* y=0 为最下层檐口（最宽，外扩 eave）；越高越收拢 */
        if (ridgeAxis === 'x') {
            const z0 = oz + y
            const z1 = oz + sizeZ - 1 - y
            if (z0 > z1) continue
            for (let x = ox - eave; x <= ox + sizeX - 1 + eave; x++) {
                for (let z = z0; z <= z1; z++) writer.set(x, oy + y, z, material)
            }
        } else {
            const x0 = ox + y
            const x1 = ox + sizeX - 1 - y
            if (x0 > x1) continue
            for (let z = oz - eave; z <= oz + sizeZ - 1 + eave; z++) {
                for (let x = x0; x <= x1; x++) writer.set(x, oy + y, z, material)
            }
        }
    }
}

/** 走道 / 廊桥：从 (x0,z0) 到 (x1,z1) 的曼哈顿折线，可带栏杆与支柱 */
export const corridor = (
    writer: BlockWriter, x0: number, z0: number, x1: number, z1: number,
    y: number, width: number, material: SurfaceMaterialId,
    railing = true, railMaterial?: SurfaceMaterialId,
): void => {
    const rail = railMaterial ?? material
    const half = Math.floor(width / 2)
    const carve = (tx: number, tz: number): void => {
        for (let w = -half; w <= half; w++) {
            writer.set(tx, y, tz + w, material)
            if (railing && (w === -half || w === half)) writer.set(tx, y + 1, tz + w, rail)
        }
    }
    const xStart = Math.min(x0, x1)
    const xEnd = Math.max(x0, x1)
    for (let x = xStart; x <= xEnd; x++) carve(x, z0)
    const zStart = Math.min(z0, z1)
    const zEnd = Math.max(z0, z1)
    for (let z = zStart; z <= zEnd; z++) carve(x1, z)
    /* 支柱：沿路径每 4 格下落至地面（局部 y=0） */
    for (let x = xStart; x <= xEnd; x += 4) {
        for (let yy = 0; yy < y; yy++) writer.set(x, yy, z0, material)
    }
    for (let z = zStart; z <= zEnd; z += 4) {
        for (let yy = 0; yy < y; yy++) writer.set(x1, yy, z, material)
    }
}

/** 地台 / 楼板：y 层长方形填充 */
export const floorSlab = (
    writer: BlockWriter, ox: number, oy: number, oz: number,
    sizeX: number, sizeZ: number, material: SurfaceMaterialId,
): void => {
    for (let x = 0; x < sizeX; x++) {
        for (let z = 0; z < sizeZ; z++) writer.set(ox + x, oy, oz + z, material)
    }
}
