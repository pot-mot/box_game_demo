import type {BuildingConfig} from '../../entity/building_generator/validation.ts'
import {generateBuilding, type BlockWriter} from '../../entity/building_generator/generators/structures.ts'
import type {SurfaceMaterialId} from '../../render/materials/ids.ts'

/** 建筑生成期的一次体素写入 / 清除操作 */
export interface BuildingBlockOp {
    readonly x: number
    readonly y: number
    readonly z: number
    /** 省略 = 清除 */
    readonly material?: SurfaceMaterialId
}

/** 捕获一次完整建筑生成的操作序列，供展示模式单步回放 */
export const captureBuildingOps = (config: BuildingConfig): BuildingBlockOp[] => {
    const ops: BuildingBlockOp[] = []
    const writer: BlockWriter = {
        set: (x, y, z, material) => { ops.push({x, y, z, material}) },
        clear: (x, y, z) => { ops.push({x, y, z}) },
    }
    generateBuilding(config, writer)
    return ops
}
