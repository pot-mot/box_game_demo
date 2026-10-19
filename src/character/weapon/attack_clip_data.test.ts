import {describe, it, expect} from 'vitest'
import {ATTACK_CLIP_JSON} from './attack_clip_data.ts'
import {SHIELD_CLASS_IDS, SHIELD_SEGMENT_TIMES} from './attack_pose_edits.ts'
import {MELEE_AIR_DURATION, MELEE_AIR_RECOVERY, MELEE_AIR_WINDUP, meleeAirSegmentId} from './melee_attacks.ts'
import {orderedSegments} from './attack_chain.ts'
import {weaponAttacksOf, weaponsOfForm} from './catalog.ts'
import {HOLD_MODES} from './hold_mode.ts'
import {HUMANOID_BODY_FORM_ID} from '../../entity/character/body_form/index.ts'
import {getAttackClipById} from '../../entity/character/appearance/clips/attack_clips.ts'

/**
 * `attack_clip_data.ts` 数据完整性（地面 / 空中 / 盾击 / 远程段同表）：
 * 1. 与武器模组的攻击段一一对应（含空中段自烘焙、盾段关键帧时间）；
 * 2. **按武器模组聚合排序**（武器类声明顺序 → 持握模式 → 段模板键），而非按攻击方式分组。
 */

const SEGMENT_ORDER = ['light_1', 'light_2', 'light_3', 'heavy_1', 'heavy_2', 'air_1', 'air_2']

/** 历史遗留 clip（曾用于长枪蓄力突刺变体，现无对应攻击段）：资产保留，不计入孤立条目断言 */
const LEGACY_CLIP_IDS = new Set(['spear_two_handed_charge_thrust'])

const humanoidWeapons = () => weaponsOfForm(HUMANOID_BODY_FORM_ID)

/** 段 id → 武器模组 / 持握模式 / 段模板键（远程段无持握模式） */
const splitSegmentId = (id: string, classIds: readonly string[]): {classId: string; mode: string; segmentKey: string} => {
    const classId = classIds.find(candidate => id.startsWith(`${candidate}_`))
    if (classId === undefined) throw new Error(`未知武器模组的段 id：${id}`)
    const rest = id.slice(classId.length + 1)
    const mode = HOLD_MODES.find(candidate => rest.startsWith(`${candidate}_`))
    return mode === undefined
        ? {classId, mode: '', segmentKey: rest}
        : {classId, mode, segmentKey: rest.slice(mode.length + 1)}
}

const airSegments = () =>
    humanoidWeapons().flatMap(weapon => {
        if (weapon.type !== 'melee') return []
        return weapon.holdModes.flatMap(mode =>
            orderedSegments(weaponAttacksOf(weapon, mode)).filter(segment => segment.key === 'air'))
    })

describe('攻击段骨骼关键帧数据（attack_clip_data.ts）', () => {
    it('按武器模组聚合排序：武器类声明顺序 → 持握模式 → 段模板键', () => {
        const classIds = [...new Set(humanoidWeapons().map(weapon => weapon.classId))]
        const ids = Object.keys(ATTACK_CLIP_JSON)
        const classRank = (classId: string): number => classIds.indexOf(classId)
        const modeRank = (mode: string): number => HOLD_MODES.indexOf(mode as typeof HOLD_MODES[number])
        const segmentRank = (key: string): number => {
            const at = SEGMENT_ORDER.indexOf(key)
            return at < 0 ? SEGMENT_ORDER.length : at
        }
        let previous = splitSegmentId(ids[0], classIds)
        for (const id of ids.slice(1)) {
            const current = splitSegmentId(id, classIds)
            const ordered = classRank(previous.classId) < classRank(current.classId)
                || (previous.classId === current.classId && modeRank(previous.mode) < modeRank(current.mode))
                || (previous.classId === current.classId && previous.mode === current.mode
                    && segmentRank(previous.segmentKey) <= segmentRank(current.segmentKey))
            expect(ordered, `${previous.classId}/${previous.mode}/${previous.segmentKey} → ${current.classId}/${current.mode}/${current.segmentKey}`)
                .toBe(true)
            previous = current
        }
    })

    it('每个空中段都有独立 clip 条目（不再复用地面段 pose）', () => {
        const segments = airSegments()
        expect(segments.length).toBeGreaterThan(0)
        for (const segment of segments) {
            expect(ATTACK_CLIP_JSON[segment.id], segment.id).toBeDefined()
            expect(segment.poses[0].poseId).toBe(segment.id)
            expect(getAttackClipById(segment.id).duration).toBeCloseTo(segment.duration + segment.recovery, 5)
        }
    })

    it('空中段关键帧时刻 = 空中段相位时间轴，命中窗口落在段内且 on 早于 off', () => {
        const times = [0, MELEE_AIR_WINDUP, MELEE_AIR_DURATION, MELEE_AIR_DURATION + MELEE_AIR_RECOVERY]
        for (const segment of airSegments()) {
            const clip = ATTACK_CLIP_JSON[segment.id]
            expect(clip.duration, segment.id).toBeCloseTo(MELEE_AIR_DURATION + MELEE_AIR_RECOVERY, 5)
            for (const track of clip.jointTracks) {
                for (const expected of times) {
                    expect(track.records.some(record => Math.abs(record.time - expected) < 1e-4), `${segment.id}/${track.targetId} @ ${expected}`)
                        .toBe(true)
                }
            }
            for (const track of clip.eventTracks) {
                const on = track.records.find(record => record.eventName === 'hitbox_on')
                const off = track.records.find(record => record.eventName === 'hitbox_off')
                expect(on, segment.id).toBeDefined()
                expect(off, segment.id).toBeDefined()
                if (on === undefined || off === undefined) continue
                expect(on.time).toBeLessThan(off.time)
                expect(off.time).toBeLessThanOrEqual(clip.duration)
            }
        }
    })

    it('空中段 / 盾段 id 均在武器模组的段清单内（不产生孤立条目）', () => {
        const known = new Set(humanoidWeapons().flatMap(weapon => weapon.holdModes.flatMap(mode =>
            Object.keys(weaponAttacksOf(weapon, mode).segments))))
        for (const id of Object.keys(ATTACK_CLIP_JSON)) {
            if (LEGACY_CLIP_IDS.has(id)) continue
            expect(known.has(id), id).toBe(true)
        }
        expect(meleeAirSegmentId('war_hammer', 'one_handed', 'air_1')).toBe('war_hammer_one_handed_air_1')
    })

    it('盾段：三档盾 × 轻/重段各有条目，时长与关键帧时间符合 SHIELD_SEGMENT_TIMES', () => {
        for (const classId of SHIELD_CLASS_IDS) {
            for (const [segmentKey, times] of Object.entries(SHIELD_SEGMENT_TIMES)) {
                const id = `${classId}_one_handed_${segmentKey}`
                const clip = ATTACK_CLIP_JSON[id]
                expect(clip, id).toBeDefined()
                expect(clip.duration).toBeCloseTo(times[3], 5)
                for (const track of clip.jointTracks) {
                    for (const time of times) {
                        expect(track.records.some(record => record.time === time), `${id}/${track.targetId} @ ${time}`).toBe(true)
                    }
                }
            }
        }
    })
})
