import {describe, it, expect} from 'vitest'
import {Quaternion, Vector3} from 'three'
import {applyTransition, lerpNumber, lerpVec3, lerpQuat} from './transition.ts'
import {strikeCurve} from '../character/combat/attack_phases.ts'

describe('线性过渡', () => {
    it('linear：恒速映射 y = t', () => {
        const spec = {type: 'linear'} as const
        expect(applyTransition(0, spec)).toBe(0)
        expect(applyTransition(0.25, spec)).toBeCloseTo(0.25)
        expect(applyTransition(0.5, spec)).toBeCloseTo(0.5)
        expect(applyTransition(1, spec)).toBe(1)
    })

    it('越界进度先夹取到 [0,1]', () => {
        const spec = {type: 'linear'} as const
        expect(applyTransition(-0.5, spec)).toBe(0)
        expect(applyTransition(1.5, spec)).toBe(1)
    })
})

describe('二阶贝塞尔缓动', () => {
    it('none：Pc=(0.5,0.5) 退化为线性', () => {
        const spec = {type: 'bezier_quad', strategy: 'none'} as const
        expect(applyTransition(0.3, spec)).toBeCloseTo(0.3)
        expect(applyTransition(0.8, spec)).toBeCloseTo(0.8)
    })

    it('ease_in：y = t²（先慢后快）', () => {
        const spec = {type: 'bezier_quad', strategy: 'ease_in'} as const
        for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            expect(applyTransition(t, spec)).toBeCloseTo(t * t)
        }
        expect(applyTransition(0, spec)).toBe(0)
        expect(applyTransition(1, spec)).toBe(1)
    })

    it('ease_out：y = 2t−t²（先快后慢）', () => {
        const spec = {type: 'bezier_quad', strategy: 'ease_out'} as const
        for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            expect(applyTransition(t, spec)).toBeCloseTo(2 * t - t * t)
        }
        expect(applyTransition(0, spec)).toBe(0)
        expect(applyTransition(1, spec)).toBe(1)
    })

    it('ease_in/ease_out 单调不减', () => {
        const easeIn = {type: 'bezier_quad', strategy: 'ease_in'} as const
        const easeOut = {type: 'bezier_quad', strategy: 'ease_out'} as const
        for (const spec of [easeIn, easeOut]) {
            let prev = 0
            for (let i = 1; i <= 100; i++) {
                const v = applyTransition(i / 100, spec)
                expect(v).toBeGreaterThanOrEqual(prev)
                prev = v
            }
        }
    })

    it('customCy：0.5 退化为线性，0 与 ease_in 一致，1 与 ease_out 一致', () => {
        expect(applyTransition(0.4, {type: 'bezier_quad', strategy: 'none', customCy: 0.5})).toBeCloseTo(0.4)
        expect(applyTransition(0.4, {type: 'bezier_quad', strategy: 'none', customCy: 0})).toBeCloseTo(0.16)
        expect(applyTransition(0.4, {type: 'bezier_quad', strategy: 'none', customCy: 1})).toBeCloseTo(0.64)
    })

    it('customCy 越界时夹取', () => {
        const spec = {type: 'bezier_quad', strategy: 'none', customCy: 3} as const
        expect(applyTransition(0.5, spec)).toBeCloseTo(0.75)
    })
})

describe('strike_peak 末端速度峰值曲线', () => {
    it('与 strikeCurve 逐点一致（默认峰值 0.7）', () => {
        const spec = {type: 'bezier_quad', strategy: 'strike_peak'} as const
        for (let i = 0; i <= 100; i++) {
            const t = i / 100
            expect(applyTransition(t, spec)).toBeCloseTo(strikeCurve(t, 0.7))
        }
    })

    it('peakRatio 参数生效且与 strikeCurve 一致', () => {
        for (const peak of [0.3, 0.5, 0.9]) {
            const spec = {type: 'bezier_quad', strategy: 'strike_peak', peakRatio: peak} as const
            for (let i = 0; i <= 100; i++) {
                const t = i / 100
                expect(applyTransition(t, spec)).toBeCloseTo(strikeCurve(t, peak))
            }
        }
    })

    it('峰值处速度连续（左右导数接近）', () => {
        const peak = 0.7
        const spec = {type: 'bezier_quad', strategy: 'strike_peak', peakRatio: peak} as const
        const h = 1e-5
        const left = (applyTransition(peak, spec) - applyTransition(peak - h, spec)) / h
        const right = (applyTransition(peak + h, spec) - applyTransition(peak, spec)) / h
        expect(Math.abs(left - right)).toBeLessThan(1e-3)
    })

    it('端点与单调性', () => {
        const spec = {type: 'bezier_quad', strategy: 'strike_peak'} as const
        expect(applyTransition(0, spec)).toBe(0)
        expect(applyTransition(1, spec)).toBe(1)
        let prev = 0
        for (let i = 1; i <= 100; i++) {
            const v = applyTransition(i / 100, spec)
            expect(v).toBeGreaterThanOrEqual(prev)
            prev = v
        }
    })
})

describe('插值助手', () => {
    it('lerpNumber 端点与中点', () => {
        expect(lerpNumber(0, 10, 0)).toBe(0)
        expect(lerpNumber(0, 10, 0.5)).toBe(5)
        expect(lerpNumber(0, 10, 1)).toBe(10)
    })

    it('lerpVec3 端点', () => {
        const a = new Vector3(1, 2, 3)
        const b = new Vector3(4, 5, 6)
        expect(lerpVec3(a, b, 0).distanceTo(a)).toBe(0)
        expect(lerpVec3(a, b, 1).distanceTo(b)).toBe(0)
        const mid = lerpVec3(a, b, 0.5)
        expect(mid.x).toBeCloseTo(2.5)
    })

    it('lerpQuat 用 slerp（端点一致）', () => {
        const a = new Quaternion()
        const b = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
        const q0 = lerpQuat(a, b, 0)
        const q1 = lerpQuat(a, b, 1)
        expect(q0.angleTo(a)).toBeLessThan(1e-6)
        expect(q1.angleTo(b)).toBeLessThan(1e-6)
        /* 半程与直接 slerp 一致 */
        expect(lerpQuat(a, b, 0.5).angleTo(a.clone().slerp(b, 0.5))).toBeLessThan(1e-6)
    })
})