import type {Placement, PlacementRot, InventoryState} from './types.ts'
import {findItemDef} from './items.ts'

export interface ShapeInfo {
    readonly mask: readonly (readonly boolean[])[]
    readonly w: number
    readonly h: number
}

const baseShapeInfo = (shape: readonly string[]): ShapeInfo => {
    const h = shape.length
    let w = 0
    for (const row of shape) w = Math.max(w, row.length)
    const mask: boolean[][] = []
    for (let y = 0; y < h; y++) {
        const row: boolean[] = []
        for (let x = 0; x < w; x++) row.push(shape[y][x] === '#')
        mask.push(row)
    }
    return {mask, w, h}
}

const rotateClockwise = (info: ShapeInfo): ShapeInfo => {
    /* 顺时针 90°：new[y][newW-1-x] = old[x][y]；新宽 = 旧高，新高 = 旧宽 */
    const newW = info.h
    const newH = info.w
    const mask: boolean[][] = Array.from({length: newH}, () => new Array<boolean>(newW).fill(false))
    for (let y = 0; y < info.w; y++) {
        for (let x = 0; x < info.h; x++) {
            mask[y][info.h - 1 - x] = info.mask[x][y]
        }
    }
    return {mask, w: newW, h: newH}
}

/** 按旋转次数（0..3）展开形状掩码 */
export const shapeInfo = (shape: readonly string[], rot: PlacementRot): ShapeInfo => {
    let info = baseShapeInfo(shape)
    for (let i = 0; i < rot; i++) info = rotateClockwise(info)
    return info
}

/** 背包占用表（1 = 已占）。excludeInstanceId 用于拖拽自身时忽略其占用 */
export const buildOccupancy = (inv: InventoryState, excludeInstanceId?: string): Uint8Array => {
    const occ = new Uint8Array(inv.width * inv.height)
    for (const stack of inv.stacks) {
        if (stack.grid === undefined || stack.instanceId === excludeInstanceId) continue
        const def = findItemDef(stack.defId)
        if (def === undefined) continue
        const info = shapeInfo(def.shape, stack.grid.rot)
        for (let y = 0; y < info.h; y++) {
            for (let x = 0; x < info.w; x++) {
                if (!info.mask[y][x]) continue
                const gx = stack.grid.x + x
                const gy = stack.grid.y + y
                if (gx < 0 || gy < 0 || gx >= inv.width || gy >= inv.height) continue
                occ[gy * inv.width + gx] = 1
            }
        }
    }
    return occ
}

export const canPlace = (occ: Uint8Array, w: number, h: number, info: ShapeInfo, x: number, y: number): boolean => {
    for (let dy = 0; dy < info.h; dy++) {
        for (let dx = 0; dx < info.w; dx++) {
            if (!info.mask[dy][dx]) continue
            const gx = x + dx
            const gy = y + dy
            if (gx < 0 || gy < 0 || gx >= w || gy >= h) return false
            if (occ[gy * w + gx] !== 0) return false
        }
    }
    return true
}

/** 在背包中寻找第一个可放置位置（旋转优先 0，再依次旋转；从上到下、从左到右） */
export const findPlacement = (occ: Uint8Array, w: number, h: number, shape: readonly string[]): Placement | undefined => {
    for (let rot = 0 as PlacementRot; rot < 4; rot = (rot + 1) as PlacementRot) {
        const info = shapeInfo(shape, rot)
        for (let y = 0; y <= h - info.h; y++) {
            for (let x = 0; x <= w - info.w; x++) {
                if (canPlace(occ, w, h, info, x, y)) return {x, y, rot}
            }
        }
    }
    return undefined
}
