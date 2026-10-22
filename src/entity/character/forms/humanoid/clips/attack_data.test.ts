import {describe, it, expect} from 'vitest'
import {ATTACK_CLIPS} from '../../../../../character/weapon/attack_clips/index.ts'
import {orderedSegments, type AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import {weaponAttacksOf, weaponsOfForm} from '../../../../../character/weapon/catalog.ts'
import {HUMANOID_BODY_FORM_ID} from '../../../body_form/index.ts'
import {CHARACTER_JOINT_IDS} from './base_clips.ts'
import {getAttackClipById} from './attack_clips.ts'
import {SUPPORT_HAND_ATTACKS} from './generated/support_hand_attacks.ts'
import {isTwoHandedAttackClip, weaponOfClip} from './support_hand_bake.ts'

const segments = weaponsOfForm(HUMANOID_BODY_FORM_ID).flatMap(weapon =>
    weapon.holdModes.flatMap(mode => orderedSegments(weaponAttacksOf(weapon, mode))),
)

/** 段实际引用的 clip id（空手通过 poseRef 复用短剑段） */
const clipIdOf = (segment: AttackSegment): string => segment.poses[0]?.poseId ?? segment.id

describe('攻击段作者数据', () => {
    it('武器链段与作者数据一一对应（无孤儿、无缺失）', () => {
        const expected = new Set(segments.map(clipIdOf))
        const actual = new Set(Object.keys(ATTACK_CLIPS))
        expect([...expected].filter(id => !actual.has(id))).toEqual([])
        expect([...actual].filter(id => !expected.has(id))).toEqual([])
    })

    it('时间栅格合法，关节列长度一致，时长等于段总时长', () => {
        for (const segment of segments) {
            const clipId = clipIdOf(segment)
            const authored = ATTACK_CLIPS[clipId]
            expect(authored, clipId).toBeDefined()
            if (authored === undefined) continue
            expect(authored.times[0], clipId).toBe(0)
            expect(authored.times.at(-1), clipId).toBeCloseTo(segment.duration + segment.recovery, 6)
            for (let index = 1; index < authored.times.length; index++) {
                expect(authored.times[index], clipId).toBeGreaterThan(authored.times[index - 1]!)
            }
            for (const [jointId, rotations] of Object.entries(authored.joints)) {
                expect(rotations.length, `${clipId}/${jointId}`).toBe(authored.times.length)
            }
        }
    })

    it('编译后的 clip 覆盖全部人形关节', () => {
        for (const segment of segments) {
            const clipId = clipIdOf(segment)
            const clip = getAttackClipById(clipId)
            const covered = new Set(clip.jointTracks.map(track => track.targetId))
            expect([...CHARACTER_JOINT_IDS].filter(id => !covered.has(id)), clipId).toEqual([])
        }
    })

    it('双手段有支撑手数据，非双手段没有', () => {
        for (const segment of segments) {
            const clipId = clipIdOf(segment)
            const twoHanded = isTwoHandedAttackClip(clipId)
            expect(SUPPORT_HAND_ATTACKS[clipId] !== undefined, clipId).toBe(twoHanded)
            if (twoHanded) expect(weaponOfClip(clipId), clipId).toBeDefined()
        }
    })

    it('事件轨落在段内，主/副手 on/off 成对', () => {
        for (const segment of segments) {
            const clipId = clipIdOf(segment)
            const records = getAttackClipById(clipId).eventTracks.flatMap(track => track.records)
            for (const record of records) {
                expect(record.time, `${clipId}/${record.eventName}`).toBeGreaterThanOrEqual(0)
                expect(record.time, `${clipId}/${record.eventName}`).toBeLessThanOrEqual(segment.duration + segment.recovery)
            }
            const main = records.filter(record => record.params?.weapon === undefined || record.params.weapon === 'main')
            expect(main.map(record => record.eventName), clipId).toEqual(['hitbox_on', 'hitbox_off'])
        }
    })
})
