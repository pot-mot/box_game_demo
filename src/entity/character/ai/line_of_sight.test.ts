import {describe, it, expect} from 'vitest'
import {BoxGeometry, Mesh, MeshBasicMaterial} from 'three'
import {createLineOfSightChecker} from './line_of_sight.ts'

/**
 * 视线检查回归：
 * 1. 射线终点落在目标体内时，必须能用 `ignoreMesh` 排除目标自身网格（否则永远判遮挡）；
 * 2. `collectBlockers` + `hasLOSPrepared` 批量查询复用同一份遮挡网格。
 */
const makeBox = (x: number): Mesh => {
    const mesh = new Mesh(new BoxGeometry(0.25, 1, 0.25), new MeshBasicMaterial())
    mesh.position.set(x, 0, 0)
    mesh.updateMatrixWorld()
    return mesh
}

describe('LineOfSightChecker 目标网格排除', () => {
    it('默认会命中目标自身网格；传入 ignoreMesh 后不再误判遮挡', () => {
        const target = makeBox(2)
        const los = createLineOfSightChecker(() => [target])
        expect(los.hasLOS(0, 0, 0, 2, 0, 0)).toBe(false)
        expect(los.hasLOS(0, 0, 0, 2, 0, 0, target)).toBe(true)
    })

    it('中间仍存在障碍时，排除目标网格后依然判遮挡', () => {
        const target = makeBox(2)
        const wall = makeBox(1)
        const los = createLineOfSightChecker(() => [target, wall])
        expect(los.hasLOS(0, 0, 0, 2, 0, 0, target)).toBe(false)
    })

    it('hasLOSPrepared 复用 collectBlockers 收集的网格列表', () => {
        const target = makeBox(2)
        const los = createLineOfSightChecker(() => [target])
        los.collectBlockers()
        expect(los.hasLOSPrepared(0, 0, 0, 2, 0, 0, target)).toBe(true)
    })
})
