import {describe, it, expect} from 'vitest'
import {findNonOverlappingY, OVERLAP_MAX_ATTEMPTS, type OverlapBox} from '.'

const SIZE_1 = {width: 1, height: 1, depth: 1}

const makeBox = (x: number, y: number, z: number, w = 1, h = 1, d = 1): OverlapBox => ({
    mesh: {position: {x, y, z}},
    config: {width: w, height: h, depth: d},
})

describe('findNonOverlappingY', () => {
    it('returns original y when no boxes exist', () => {
        const result = findNonOverlappingY([], SIZE_1, 0, 5, 0)
        expect(result).toBe(5)
    })

    it('returns original y when no overlap with existing boxes', () => {
        const existing = makeBox(10, 1, 10)
        const result = findNonOverlappingY([existing], SIZE_1, 0, 5, 0)
        expect(result).toBe(5)
    })

    it('shifts y above overlapping box', () => {
        const existing = makeBox(0, 0.5, 0)
        const result = findNonOverlappingY([existing], SIZE_1, 0, 0, 0)
        // box top at 1.0, our half height 0.5 → y >= 1.0 + 0.5 = 1.5
        expect(result).toBeGreaterThanOrEqual(1.5)
    })

    it('shifts y above the tallest overlapping box', () => {
        const boxes = [makeBox(0, 0.5, 0), makeBox(0, 2, 0)]
        const result = findNonOverlappingY(boxes, SIZE_1, 0, 0, 0)
        // tallest box top at 2.5, our half height 0.5 → y >= 2.5 + 0.5 = 3.0
        expect(result).toBeGreaterThanOrEqual(3.0)
    })

    it('respects terrain height', () => {
        const getTerrainHeight = (_x: number, _z: number) => 2
        const result = findNonOverlappingY([], SIZE_1, 0, 0, 0, undefined, getTerrainHeight)
        // terrain at 2, need bottom > 2.01, half height 0.5 → y >= 2.51
        expect(result).toBeGreaterThanOrEqual(2.51)
    })

    it('respects terrain height even when y is already above', () => {
        const getTerrainHeight = (_x: number, _z: number) => 2
        const result = findNonOverlappingY([], SIZE_1, 0, 10, 0, undefined, getTerrainHeight)
        // y=10 is already above terrain, should stay at 10
        expect(result).toBe(10)
    })

    it('lifts box above ground when y is too low', () => {
        const result = findNonOverlappingY([], SIZE_1, 0, -10, 0)
        // ground at 0, half height 0.5 → y >= 0.5
        expect(result).toBeGreaterThanOrEqual(0.5)
    })

    it('respects skipIf condition', () => {
        const skip = makeBox(0, 0.5, 0)
        const other = makeBox(0, 2, 0)
        const result = findNonOverlappingY(
            [skip, other],
            SIZE_1,
            0, 1.5, 0,
            b => b.mesh.position.y === 0.5,
        )
        // skipped y=0.5 box, y=1.5 overlaps with y=2 box (top 2.5), shifts to >= 3.0
        expect(result).toBeGreaterThanOrEqual(3.0)
    })

    it('handles thin tall boxes correctly', () => {
        const existing = makeBox(0, 0.5, 0, 1, 3, 1)
        const result = findNonOverlappingY([existing], SIZE_1, 0, 0, 0)
        // existing top at 2.0, our half height 0.5 → y >= 2.5
        expect(result).toBeGreaterThanOrEqual(2.5)
    })

    it('limits attempts to OVERLAP_MAX_ATTEMPTS', () => {
        const boxes: OverlapBox[] = []
        for (let i = 0; i < OVERLAP_MAX_ATTEMPTS + 10; i++) {
            boxes.push(makeBox(0, i * 0.5 + 0.5, 0))
        }
        const result = findNonOverlappingY(boxes, SIZE_1, 0, 0, 0)
        // Should have climbed up the stack without infinite looping
        expect(result).toBeGreaterThan(0)
    })

    it('不移动水平方向偏移不重叠的箱子', () => {
        const existing = makeBox(0, 0.5, 0)
        // 新箱子在 X 方向偏移 2，大于半宽之和 (0.5 + 0.5 = 1)
        const result = findNonOverlappingY([existing], SIZE_1, 2, 0.5, 0)
        expect(result).toBe(0.5)
    })

    it('不移动 Z 方向偏移不重叠的箱子', () => {
        const existing = makeBox(0, 0.5, 0)
        // 新箱子在 Z 方向偏移 2，大于半深之和 (0.5 + 0.5 = 1)
        const result = findNonOverlappingY([existing], SIZE_1, 0, 0.5, 2)
        expect(result).toBe(0.5)
    })

    it('处理恰好接触但不重叠的箱子（AABB 临界情况）', () => {
        const existing = makeBox(0, 0.5, 0)
        // existing 占据 y 范围 [0, 1]，新箱在 y=1.5 时占据 [1.0, 2.0]，恰好 boundary 接触
        const result = findNonOverlappingY([existing], SIZE_1, 0, 1.5, 0)
        expect(result).toBe(1.5)
    })

    it('多轮迭代找到最终无重叠位置', () => {
        const boxes = [
            makeBox(0, 0.5, 0),
            makeBox(0, 1.5, 0),
            makeBox(0, 2.5, 0),
        ]
        // 从 y=0 开始，需要连续升到 3.5+
        const result = findNonOverlappingY(boxes, SIZE_1, 0, 0, 0)
        expect(result).toBeGreaterThanOrEqual(3.5)
    })

    it('地形高度优先于地面高度', () => {
        const getTerrain = (_x: number, _z: number) => 0.5
        const result = findNonOverlappingY([], SIZE_1, 0, 0, 0, undefined, getTerrain)
        // terrain at 0.5, bottom > 0.51, half height 0.5 → y >= 1.01
        expect(result).toBeGreaterThanOrEqual(1.01)
    })

    it('同时处理地形和箱子重叠', () => {
        const existing = makeBox(0, 1.0, 0)
        const getTerrain = (_x: number, _z: number) => 0.5
        const result = findNonOverlappingY([existing], SIZE_1, 0, 0, 0, undefined, getTerrain)
        // terrain raises bottom first, then box overlap raises further
        // box top at 1.5, half height 0.5 → y >= 2.0
        expect(result).toBeGreaterThanOrEqual(2.0)
    })
})
