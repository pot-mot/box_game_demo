import {describe, it, expect} from 'vitest'
import {obbIntersectsHurt} from './shapes.ts'
import {yawOBB, type OBB} from './obb.ts'
import {worldizeHurtBlock, zeroWorldHurtBlock} from '../../../character/hurt_blocks.ts'

const obb = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0): OBB =>
    yawOBB(cx, cy, cz, hx, hy, hz, yaw)

const boxBlock = (half: number) => {
    const b = zeroWorldHurtBlock('box')
    b.kind = 'box'
    b.half = {x: half, y: half, z: half}
    return b
}
const sphereBlock = (r: number) => {
    const b = zeroWorldHurtBlock('s')
    b.kind = 'sphere'
    b.radius = r
    return b
}
const cylinderBlock = (r: number, h: number) => {
    const b = zeroWorldHurtBlock('c')
    b.kind = 'cylinder'
    b.radius = r
    b.halfHeight = h / 2
    return b
}

describe('obbIntersectsHurt（近战武器 OBB × 受击块）', () => {
    it('盒：SAT 相交', () => {
        expect(obbIntersectsHurt(obb(0, 0, 0, 0.5, 0.5, 0.5), boxBlock(1))).toBe(true)
        expect(obbIntersectsHurt(obb(3, 0, 0, 0.5, 0.5, 0.5), boxBlock(1))).toBe(false)
    })
    it('球：最近距离', () => {
        expect(obbIntersectsHurt(obb(1.3, 0, 0, 0.5, 0.5, 0.5), sphereBlock(1))).toBe(true)
        expect(obbIntersectsHurt(obb(2.5, 0, 0, 0.5, 0.5, 0.5), sphereBlock(1))).toBe(false)
    })
    it('柱：沿轴采样', () => {
        expect(obbIntersectsHurt(obb(0.8, 1.5, 0, 0.3, 0.3, 0.3), cylinderBlock(1, 2))).toBe(true)
        expect(obbIntersectsHurt(obb(3, 0, 0, 0.3, 0.3, 0.3), cylinderBlock(1, 2))).toBe(false)
    })
})

describe('worldizeHurtBlock', () => {
    it('按矩阵列缩放盒半长与偏移', () => {
        /* 单位盒，矩阵缩放 2 倍并平移 (1,0,0) */
        const elements = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0, 0, 1]
        const wb = worldizeHurtBlock(
            {id: 'b', jointId: 'j', shape: {kind: 'box', half: {x: 1, y: 1, z: 1}}},
            elements,
        )
        expect(wb.half.x).toBeCloseTo(2)
        expect(wb.half.y).toBeCloseTo(2)
        expect(wb.half.z).toBeCloseTo(2)
        expect(wb.center.x).toBeCloseTo(1)
    })
})
