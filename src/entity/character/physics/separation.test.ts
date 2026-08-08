import {describe, it, expect} from 'vitest'
import {computeSeparation} from './separation.ts'

const R = 0.125
const SEP_SPEED = 24

describe('computeSeparation', () => {
    it('重叠时两端各移动一半重叠量并反向速度踢', () => {
        /* 间距 0.2 < 最小间距 0.25 → 重叠 0.05，各移 0.025 */
        const sep = computeSeparation({aiX: 0, aiZ: 0, ajX: 0.2, ajZ: 0, radiusA: R, radiusB: R}, SEP_SPEED)
        expect(sep).not.toBeNull()
        expect(sep!.aiDx).toBeCloseTo(-0.025, 10)
        expect(sep!.ajDx).toBeCloseTo(0.025, 10)
        expect(sep!.aiVx).toBeCloseTo(-12, 10)
        expect(sep!.ajVx).toBeCloseTo(12, 10)
    })

    it('不重叠返回 null', () => {
        const sep = computeSeparation({aiX: 0, aiZ: 0, ajX: 0.3, ajZ: 0, radiusA: R, radiusB: R}, SEP_SPEED)
        expect(sep).toBeNull()
    })

    it('恰好相切（dist === minDist）返回 null', () => {
        const sep = computeSeparation({aiX: 0, aiZ: 0, ajX: 0.25, ajZ: 0, radiusA: R, radiusB: R}, SEP_SPEED)
        expect(sep).toBeNull()
    })

    it('完全重合时兜底向 +X 分离', () => {
        const sep = computeSeparation({aiX: 1, aiZ: 1, ajX: 1, ajZ: 1, radiusA: R, radiusB: R}, SEP_SPEED)
        expect(sep).not.toBeNull()
        expect(sep!.aiDx).toBeCloseTo(-0.125, 10)
        expect(sep!.ajDx).toBeCloseTo(0.125, 10)
        expect(sep!.aiDz).toBeCloseTo(0, 10)
    })

    it('对角重叠沿连线方向分离且两端位移总和等于重叠量', () => {
        const sep = computeSeparation({aiX: 0, aiZ: 0, ajX: 0.15, ajZ: 0.15, radiusA: R, radiusB: R}, SEP_SPEED)
        expect(sep).not.toBeNull()
        const overlap = 0.25 - Math.hypot(0.15, 0.15)
        const expectedEach = overlap * 0.5 / Math.hypot(0.15, 0.15)
        expect(sep!.aiDx).toBeCloseTo(-expectedEach * 0.15, 10)
        expect(sep!.ajDx).toBeCloseTo(expectedEach * 0.15, 10)
        expect(sep!.ajDz).toBeCloseTo(expectedEach * 0.15, 10)
    })
})
