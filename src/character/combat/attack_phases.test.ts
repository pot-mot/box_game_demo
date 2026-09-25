import {describe, it, expect} from 'vitest'
import {
    applyEasing, strikeCurve,
    ATTACK_PHASES, EASING_TYPES, ATTACK_TYPES,
    resolvePhases, phaseDurationOf,
} from './attack_phases.ts'
import {MELEE_WEAPON_PRESETS} from '../weapon/melee_weapon.ts'
import {ALL_WEAPON_PRESETS} from '../weapon/catalog.ts'
import type {AttackSegment} from '../weapon/attack_chain.ts'

/** 武器攻击段夹具：轻/重链各 2 段，段本身携带阶段序列与时长（不再有技能预设表） */
const allSegments: Record<string, AttackSegment> = {}
for (const preset of ALL_WEAPON_PRESETS) {
    for (const [segmentId, segment] of Object.entries(preset.attacks.segments)) allSegments[segmentId] = segment
}

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

describe('段阶段完整性', () => {
    it('段清单非空（全部近战/远程武器段 + 变体段）', () => {
        expect(Object.keys(allSegments).length).toBeGreaterThan(0)
        expect(allSegments['short_sword_light_1']).toBeDefined()
        /* 巨剑三段轻链的第三段与长枪蓄力突刺变体也在清单内 */
        expect(allSegments['heavy_sword_light_3']).toBeDefined()
        expect(allSegments['spear_charge_thrust']).toBeDefined()
    })

    it('所有段的 durationRatio 之和为 1', () => {
        for (const [segmentId, segment] of Object.entries(allSegments)) {
            const sum = segment.phases.reduce((acc, p) => acc + p.durationRatio, 0)
            expect(sum, segmentId).toBeCloseTo(1, 6)
        }
    })

    it('所有阶段名合法且 animConfig 字段在合法范围', () => {
        for (const [segmentId, segment] of Object.entries(allSegments)) {
            for (const phase of segment.phases) {
                expect(ATTACK_PHASES, `${segmentId}.${phase.name}`).toContain(phase.name)
                expect(ATTACK_TYPES, `${segmentId}.${phase.name}.attackType`).toContain(phase.animConfig.attackType)
                expect(EASING_TYPES, `${segmentId}.${phase.name}.easing`).toContain(phase.animConfig.easing)
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
        expect(resolvePhases(allSegments['long_sword_light_1'].phases)).toHaveLength(2)
    })
})

describe('近战攻击段约束（比例/类型/tilt 确定性）', () => {
    const weaponIds = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer']

    it('每把武器的全部段齐全（strike + recovery 两段式）', () => {
        for (const weaponId of weaponIds) {
            for (const segment of Object.values(MELEE_WEAPON_PRESETS[weaponId].attacks.segments)) {
                expect(segment.phases, segment.id).toHaveLength(2)
                expect(segment.phases[0].name).toBe('strike')
                expect(segment.phases[1].name).toBe('recovery')
            }
        }
    })

    it('strike ratio = 1，recovery ratio = 0（恢复时长取 segment.recovery 不参与分摊）', () => {
        for (const weaponId of weaponIds) {
            for (const segment of Object.values(MELEE_WEAPON_PRESETS[weaponId].attacks.segments)) {
                expect(segment.phases[0].durationRatio, `${segment.id} strike`).toBe(1)
                expect(segment.phases[1].durationRatio, `${segment.id} recovery`).toBe(0)
            }
        }
    })

    it('段动作类型：轻1 竖斩 / 轻2 直刺 / 轻3 斜斩（仅巨剑）/ 重1 横斩 / 重2 斜劈', () => {
        for (const weaponId of weaponIds) {
            const strikeTypeOf = (segmentId: string): string | undefined =>
                MELEE_WEAPON_PRESETS[weaponId].attacks.segments[segmentId]?.phases[0].animConfig.attackType
            expect(strikeTypeOf(`${weaponId}_light_1`)).toBe('slash')
            expect(strikeTypeOf(`${weaponId}_light_2`)).toBe('thrust')
            expect(strikeTypeOf(`${weaponId}_heavy_1`)).toBe('slash')
            expect(strikeTypeOf(`${weaponId}_heavy_2`)).toBe('slash')
            /* 三段轻链的收招段（只有巨剑声明）：斜斩 */
            const light3 = strikeTypeOf(`${weaponId}_light_3`)
            if (light3 !== undefined) expect(light3).toBe('slash')
        }
    })

    it('swingTilt 段固有确定性：轻1/轻2=0、轻3 右向斜挑（仅巨剑）、重1=左向横斩、重2=右向斜劈', () => {
        for (const weaponId of weaponIds) {
            const segmentOf = (segmentId: string): AttackSegment | undefined =>
                MELEE_WEAPON_PRESETS[weaponId].attacks.segments[segmentId]
            expect(segmentOf(`${weaponId}_light_1`)?.swingTilt ?? 0).toBe(0)
            expect(segmentOf(`${weaponId}_light_2`)?.swingTilt ?? 0).toBe(0)
            const light3 = segmentOf(`${weaponId}_light_3`)
            if (light3 !== undefined) expect(light3.swingTilt ?? 0).toBeLessThan(0)
            expect(segmentOf(`${weaponId}_heavy_1`)?.swingTilt).toBeGreaterThan(Math.PI * 0.4)
            expect(segmentOf(`${weaponId}_heavy_2`)?.swingTilt).toBeLessThan(0)
        }
    })
})

describe('phaseDurationOf（单阶段时长）', () => {
    const segment = allSegments['short_sword_light_1']
    const phases = segment.phases

    it('动作阶段按 durationRatio 从动作时间分摊', () => {
        expect(phaseDurationOf(phases[0], segment.duration, segment.recovery)).toBeCloseTo(segment.duration * phases[0].durationRatio)
    })

    it('recovery 阶段取 segment.recovery（ratio 不参与）', () => {
        expect(phaseDurationOf(phases[1], segment.duration, segment.recovery)).toBeCloseTo(segment.recovery)
        expect(phaseDurationOf(phases[1], segment.duration, 0.7)).toBeCloseTo(0.7)
    })

    it('段总时长 = 动作时间 + 恢复时间', () => {
        const total = phases.reduce((sum, p) => sum + phaseDurationOf(p, segment.duration, segment.recovery), 0)
        expect(total).toBeCloseTo(segment.duration + segment.recovery)
    })
})
