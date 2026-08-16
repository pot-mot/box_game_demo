import {describe, it, expect} from 'vitest'
import {yawOBB, obbFromTransform, obbIntersect, type OBB} from './obb.ts'

/* 轴对齐盒（yaw=0） */
const aabb = (cx: number, cy: number, cz: number, hx = 0.5, hy = 0.5, hz = 0.5): OBB =>
    yawOBB(cx, cy, cz, hx, hy, hz, 0)

describe('yawOBB', () => {
    it('yaw=0 时三轴与世界轴对齐', () => {
        const box = yawOBB(0, 0, 0, 1, 1, 1, 0)
        expect(box.axes[0].x).toBeCloseTo(1)
        expect(box.axes[0].y).toBeCloseTo(0)
        expect(box.axes[0].z).toBeCloseTo(0)
        expect(box.axes[1].x).toBeCloseTo(0)
        expect(box.axes[1].y).toBeCloseTo(1)
        expect(box.axes[1].z).toBeCloseTo(0)
        expect(box.axes[2].x).toBeCloseTo(0)
        expect(box.axes[2].y).toBeCloseTo(0)
        expect(box.axes[2].z).toBeCloseTo(1)
    })

    it('三轴正交且为单位向量（任意 yaw）', () => {
        for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2.3]) {
            const [ax, ay, az] = yawOBB(0, 0, 0, 1, 1, 1, yaw).axes
            const dot = (a: {x: number; y: number; z: number}, b: {x: number; y: number; z: number}): number =>
                a.x * b.x + a.y * b.y + a.z * b.z
            expect(dot(ax, ay)).toBeCloseTo(0)
            expect(dot(ax, az)).toBeCloseTo(0)
            expect(dot(ay, az)).toBeCloseTo(0)
            for (const a of [ax, ay, az]) {
                expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(1)
            }
        }
    })

    it('yaw=π/2 时本地 +Z 轴指向世界 +X（与 Three.js rotation.y 一致）', () => {
        const box = yawOBB(0, 0, 0, 1, 1, 1, Math.PI / 2)
        expect(box.axes[2].x).toBeCloseTo(1)
        expect(box.axes[2].z).toBeCloseTo(0)
    })
})

describe('obbIntersect（15 轴 SAT）', () => {
    it('轴对齐盒：重叠时相交，分离时不相交', () => {
        expect(obbIntersect(aabb(0, 0, 0), aabb(0.9, 0, 0))).toBe(true)
        expect(obbIntersect(aabb(0, 0, 0), aabb(1.1, 0, 0))).toBe(false)
        expect(obbIntersect(aabb(0, 0, 0), aabb(0, 1.1, 0))).toBe(false)
        expect(obbIntersect(aabb(0, 0, 0), aabb(0, 0, 1.1))).toBe(false)
    })

    it('角对角重叠：每轴投影均重叠且空间上确有公共点', () => {
        /* AABB 只需 3 条面轴即可判完：中心距 (0.8, 0.8, 0.8) 每轴投影重叠 0.2，
         * 公共点 (0.5, 0.5, 0.5) 同时属于两盒 → 相交；(1.1, 0.9, 0.9) 则 X 轴分离 */
        expect(obbIntersect(aabb(0, 0, 0), aabb(0.8, 0.8, 0.8))).toBe(true)
        expect(obbIntersect(aabb(0, 0, 0), aabb(1.1, 0.9, 0.9))).toBe(false)
    })

    it('45° 旋转盒：角对角接触判定正确', () => {
        /* B 绕 Y 转 45°，水平截面为边长 √2 的菱形（半对角 ≈ 0.707）。
         * 沿 X 排布：中心距 1.2 < 0.5 + 0.707 → 相交；1.3 > 1.207 → 分离 */
        const rotated = yawOBB(1.2, 0, 0, 0.5, 0.5, 0.5, Math.PI / 4)
        expect(obbIntersect(aabb(0, 0, 0), rotated)).toBe(true)
        const farther = yawOBB(1.3, 0, 0, 0.5, 0.5, 0.5, Math.PI / 4)
        expect(obbIntersect(aabb(0, 0, 0), farther)).toBe(false)
    })

    it('同 yaw 平行盒（叉积轴退化）不误判', () => {
        /* 双方轴完全平行 → 9 条叉积轴全为零向量，依赖 EPS 容差跳过；
         * SAT 投影到盒自身轴：沿世界 X 偏移 d 在 A 面轴上投影 = d·cos(yaw)，
         * 分离阈值 d = 2/cos(0.5) ≈ 2.279 */
        expect(obbIntersect(yawOBB(0, 0, 0, 1, 1, 1, 0.5), yawOBB(2.2, 0, 0, 1, 1, 1, 0.5))).toBe(true)
        expect(obbIntersect(yawOBB(0, 0, 0, 1, 1, 1, 0.5), yawOBB(2.3, 0, 0, 1, 1, 1, 0.5))).toBe(false)
    })

    it('相交检测对称：a,b 交换结果一致', () => {
        const a = yawOBB(0, 0, 0, 0.5, 0.8, 0.3, 0.4)
        const b = yawOBB(0.8, 0.2, 0.5, 0.4, 0.4, 0.6, -1.1)
        expect(obbIntersect(a, b)).toBe(obbIntersect(b, a))
        const c = yawOBB(3, 0, 0, 0.4, 0.4, 0.6, -1.1)
        expect(obbIntersect(a, c)).toBe(obbIntersect(c, a))
    })
})

describe('obbFromTransform（列主序变换矩阵）', () => {
    it('单位矩阵：世界盒 = 本地盒', () => {
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        const box = obbFromTransform(identity, {x: 0.1, y: 0.2, z: 0.3}, {x: 0.5, y: 0.6, z: 0.7})
        expect(box.center).toEqual({x: 0.1, y: 0.2, z: 0.3})
        expect(box.half).toEqual({x: 0.5, y: 0.6, z: 0.7})
    })

    it('平移矩阵：中心随平移偏移', () => {
        const translated = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]
        const box = obbFromTransform(translated, {x: 0, y: 0, z: 0}, {x: 0.5, y: 0.5, z: 0.5})
        expect(box.center).toEqual({x: 2, y: 3, z: 4})
    })

    it('缩放矩阵：半长按列向量长度缩放，轴保持归一化', () => {
        /* 列向量长度分别为 2 / 3 / 4 */
        const scaled = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1]
        const box = obbFromTransform(scaled, {x: 0, y: 0, z: 0}, {x: 0.5, y: 0.5, z: 0.5})
        expect(box.half.x).toBeCloseTo(1)
        expect(box.half.y).toBeCloseTo(1.5)
        expect(box.half.z).toBeCloseTo(2)
        for (const a of box.axes) {
            expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(1)
        }
    })

    it('yaw 旋转矩阵：与 yawOBB 等价', () => {
        const yaw = Math.PI / 3
        const cos = Math.cos(yaw)
        const sin = Math.sin(yaw)
        /* 列主序：列0 = (cos,0,-sin)，列2 = (sin,0,cos) */
        const elements = [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 1, 0, 2, 1]
        const box = obbFromTransform(elements, {x: 0, y: 0, z: 0}, {x: 0.5, y: 0.5, z: 0.5})
        const ref = yawOBB(1, 0, 2, 0.5, 0.5, 0.5, yaw)
        expect(box.center.x).toBeCloseTo(ref.center.x)
        expect(box.center.z).toBeCloseTo(ref.center.z)
        for (let i = 0; i < 3; i++) {
            expect(box.axes[i].x).toBeCloseTo(ref.axes[i].x)
            expect(box.axes[i].y).toBeCloseTo(ref.axes[i].y)
            expect(box.axes[i].z).toBeCloseTo(ref.axes[i].z)
        }
    })

    it('本地中心偏移经旋转正确变换到世界空间', () => {
        /* yaw=π/2：本地 +Z 偏移转为世界 +X */
        const elements = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]
        const box = obbFromTransform(elements, {x: 0, y: 0.5, z: 0.3}, {x: 0.1, y: 0.1, z: 0.1})
        expect(box.center.x).toBeCloseTo(0.3)
        expect(box.center.y).toBeCloseTo(0.5)
        expect(box.center.z).toBeCloseTo(0)
    })
})
