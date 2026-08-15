import {describe, it, expect} from 'vitest'
import {
    applyEasing, strikeCurve,
    ATTACK_PHASES, EASING_TYPES, ATTACK_TYPES,
    MELEE_PHASE_PRESETS, RANGED_PHASE_PRESETS, resolvePhases,
} from './attack_phases.ts'

describe('applyEasing', () => {
    it('端点恒等：f(0)=0, f(1)=1', () => {
        for (const easing of EASING_TYPES) {
            expect(applyEasing(0, easing)).toBe(0)
            expect(applyEasing(1, easing)).toBe(1)
        }
    })

    it('单调不减', () => {
        for (const easing of EASING_TYPES) {
            let prev = applyEasing(0, easing)
            for (let p = 0.01; p <= 1.0001; p += 0.01) {
                const cur = applyEasing(p, easing)
                expect(cur).toBeGreaterThanOrEqual(prev - 1e-9)
                prev = cur
            }
        }
    })

    it('ease_out 前段快后段慢', () => {
        expect(applyEasing(0.25, 'ease_out')).toBeGreaterThan(0.25)
        expect(applyEasing(0.75, 'ease_out')).toBeLessThan(1)
    })
})

describe('strikeCurve（末端加速打击曲线）', () => {
    it('端点恒等：f(0)=0, f(1)=1', () => {
        for (const peak of [0, 0.3, 0.5, 0.7, 1]) {
            expect(strikeCurve(0, peak)).toBe(0)
            expect(strikeCurve(1, peak)).toBe(1)
        }
    })

    it('单调不减', () => {
        for (const peak of [0.2, 0.5, 0.7, 0.9]) {
            let prev = 0
            for (let p = 0.01; p <= 1.0001; p += 0.01) {
                const cur = strikeCurve(p, peak)
                expect(cur).toBeGreaterThanOrEqual(prev - 1e-9)
                prev = cur
            }
        }
    })

    it('峰值处曲线值与速度连续（无跳变）', () => {
        for (const peak of [0.3, 0.5, 0.7]) {
            const eps = 1e-6
            const left = strikeCurve(peak - eps, peak)
            const right = strikeCurve(peak + eps, peak)
            expect(Math.abs(right - left)).toBeLessThan(1e-4)
            /* 速度连续：峰值两侧导数均趋近 2 */
            const dLeft = (strikeCurve(peak, peak) - strikeCurve(peak - 1e-4, peak)) / 1e-4
            const dRight = (strikeCurve(peak + 1e-4, peak) - strikeCurve(peak, peak)) / 1e-4
            expect(Math.abs(dLeft - dRight)).toBeLessThan(1e-2)
        }
    })

    it('速度峰值位于 strikePeakRatio：峰值前加速、峰值后减速', () => {
        const peak = 0.7
        const vBefore = (strikeCurve(peak, peak) - strikeCurve(peak - 0.1, peak)) / 0.1
        const vEarly = (strikeCurve(0.3, peak) - strikeCurve(0.2, peak)) / 0.1
        const vAfter = (strikeCurve(1, peak) - strikeCurve(0.9, peak)) / 0.1
        expect(vBefore).toBeGreaterThan(vEarly)
        expect(vBefore).toBeGreaterThan(vAfter)
    })
})

describe('阶段预设完整性', () => {
    const allPresets: Record<string, readonly unknown[]> = {
        ...MELEE_PHASE_PRESETS,
        ...RANGED_PHASE_PRESETS,
    }

    it('所有技能的 durationRatio 之和为 1', () => {
        for (const [skillId, phases] of Object.entries(allPresets)) {
            const sum = (phases as readonly {durationRatio: number}[]).reduce((acc, p) => acc + p.durationRatio, 0)
            expect(sum, skillId).toBeCloseTo(1, 6)
        }
    })

    it('所有阶段名合法且 animConfig 字段在合法范围', () => {
        for (const [skillId, phases] of Object.entries(allPresets)) {
            for (const phase of phases as readonly {name: string; animConfig: {
                attackType: string; strikePeakRatio: number; overshootRatio: number; easing: string; twoHanded: boolean;
            }}[]) {
                expect(ATTACK_PHASES, `${skillId}.${phase.name}`).toContain(phase.name)
                expect(ATTACK_TYPES, `${skillId}.${phase.name}.attackType`).toContain(phase.animConfig.attackType)
                expect(EASING_TYPES, `${skillId}.${phase.name}.easing`).toContain(phase.animConfig.easing)
                expect(phase.animConfig.strikePeakRatio).toBeGreaterThan(0)
                expect(phase.animConfig.strikePeakRatio).toBeLessThanOrEqual(1)
                expect(phase.animConfig.overshootRatio).toBeGreaterThanOrEqual(0)
                expect(phase.animConfig.overshootRatio).toBeLessThan(1)
            }
        }
    })

    it('resolvePhases 空数组回退到单阶段', () => {
        expect(resolvePhases(undefined)).toHaveLength(1)
        expect(resolvePhases([])).toHaveLength(1)
        expect(resolvePhases(MELEE_PHASE_PRESETS.long_sword_slash)).toHaveLength(3)
    })
})
