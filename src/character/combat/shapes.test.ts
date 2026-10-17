import {describe, it, expect} from 'vitest'
import {pointIntersectsHurt, sphereIntersectsHurt, segmentIntersectsHurt} from './shapes.ts'
import type {WorldHurtBlock} from '../hurt_blocks.ts'
import {zeroWorldHurtBlock} from '../hurt_blocks.ts'

const box = (half: number): WorldHurtBlock => {
    const b = zeroWorldHurtBlock('box')
    b.kind = 'box'
    b.half = {x: half, y: half, z: half}
    return b
}
const sphere = (r: number): WorldHurtBlock => {
    const b = zeroWorldHurtBlock('sphere')
    b.kind = 'sphere'
    b.radius = r
    return b
}
const cylinder = (r: number, h: number): WorldHurtBlock => {
    const b = zeroWorldHurtBlock('cyl')
    b.kind = 'cylinder'
    b.radius = r
    b.halfHeight = h / 2
    return b
}

describe('pointIntersectsHurt', () => {
    it('盒：内外判定', () => {
        expect(pointIntersectsHurt(0.5, 0, 0, box(1))).toBe(true)
        expect(pointIntersectsHurt(1.5, 0, 0, box(1))).toBe(false)
    })
    it('球：内外判定', () => {
        expect(pointIntersectsHurt(0.5, 0, 0, sphere(1))).toBe(true)
        expect(pointIntersectsHurt(1.5, 0, 0, sphere(1))).toBe(false)
    })
    it('柱：半径与高度约束', () => {
        expect(pointIntersectsHurt(0.5, 1.5, 0, cylinder(1, 2))).toBe(true)
        expect(pointIntersectsHurt(0.5, 2.5, 0, cylinder(1, 2))).toBe(false)
        expect(pointIntersectsHurt(1.5, 0, 0, cylinder(1, 2))).toBe(false)
    })
})

describe('sphereIntersectsHurt', () => {
    it('爆炸球 × 盒：边界距离', () => {
        expect(sphereIntersectsHurt(1.2, 0, 0, 0.5, box(1))).toBe(true)
        expect(sphereIntersectsHurt(2, 0, 0, 0.5, box(1))).toBe(false)
    })
    it('爆炸球 × 球：半径和', () => {
        expect(sphereIntersectsHurt(1.5, 0, 0, 0.5, sphere(1))).toBe(true)
        expect(sphereIntersectsHurt(1.6, 0, 0, 0.5, sphere(1))).toBe(false)
    })
    it('爆炸球 × 柱：轴向与半径', () => {
        expect(sphereIntersectsHurt(0, 1.4, 0, 0.3, cylinder(1, 2))).toBe(true)
        expect(sphereIntersectsHurt(0, 2.5, 0, 0.3, cylinder(1, 2))).toBe(false)
    })
})

describe('segmentIntersectsHurt（子弹扫掠）', () => {
    it('线段穿过盒 → true；擦肩而过 → false', () => {
        expect(segmentIntersectsHurt(-3, 0, 0, 3, 0, 0, box(1))).toBe(true)
        /* 抬到盒上方：y=2 高于半高 1 */
        expect(segmentIntersectsHurt(-3, 2, 0, 3, 2, 0, box(1))).toBe(false)
    })
    it('线段端点已越过高速目标仍能命中（单点采样会漏）', () => {
        /* 起点在盒左、终点在盒右，中间穿过 */
        expect(segmentIntersectsHurt(-2.5, 0, 0, 2.5, 0, 0, box(0.2))).toBe(true)
    })
    it('线段 × 球', () => {
        expect(segmentIntersectsHurt(-3, 0.5, 0, 3, 0.5, 0, sphere(1))).toBe(true)
        expect(segmentIntersectsHurt(-3, 2, 0, 3, 2, 0, sphere(1))).toBe(false)
    })
    it('线段 × 柱', () => {
        expect(segmentIntersectsHurt(-3, 0.5, 0, 3, 0.5, 0, cylinder(1, 2))).toBe(true)
        expect(segmentIntersectsHurt(-3, 3, 0, 3, 3, 0, cylinder(1, 2))).toBe(false)
    })
})
