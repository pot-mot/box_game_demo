import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {BUILTIN_CLIP_GROUP_ORDER, findBuiltinClip, getBuiltinClips} from './builtin_clips.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/character/skeleton/preset.ts'
import {sampleClip} from '../../skeleton/anim/sampling.ts'
import {MELEE_WEAPON_PRESETS} from '../../character/weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from '../../character/weapon/ranged_weapon.ts'
import {orderedSegments} from '../../character/weapon/attack_chain.ts'
import {weaponAttacksOf, type WeaponConfig} from '../../character/weapon/catalog.ts'
import {HOLD_MODE_LABELS} from '../../character/weapon/hold_mode.ts'
import type {BuiltinClipEntry} from './builtin_clips.ts'

const entriesOf = (group: string): readonly BuiltinClipEntry[] =>
    getBuiltinClips().filter(entry => entry.group === group)

/** 武器模组声明的全部攻击段 id（全部持握模式，与内置动作库同一枚举顺序） */
const segmentIdsOf = (weapons: readonly WeaponConfig[]): ReadonlySet<string> =>
    new Set(weapons.flatMap(weapon =>
        weapon.holdModes.flatMap(mode => orderedSegments(weaponAttacksOf(weapon, mode)).map(segment => segment.id)),
    ))

/** 近战武器全部攻击段总数（6 武器 × 3 模式；巨剑/长枪双手链各多一段） */
const MELEE_SEGMENT_COUNT = Object.values(MELEE_WEAPON_PRESETS)
    .reduce((sum, weapon) => sum + weapon.holdModes
        .reduce((modeSum, mode) => modeSum + orderedSegments(weaponAttacksOf(weapon, mode)).length, 0), 0)

const presetPositions = (): ReadonlyMap<string, Vector3> => {
    const definition = buildCharacterSkeletonDefinition()
    return new Map(definition.joints.map(joint => [joint.id, new Vector3().fromArray([...joint.position])]))
}

describe('骨骼编辑器内置动作库（getBuiltinClips）', () => {
    it('覆盖全部基础状态与全部武器的攻击段（含全部持握模式）', () => {
        const library = getBuiltinClips()
        /* 基础状态 9 + 近战全模式段 + 远程 9 */
        expect(library.length).toBe(9 + MELEE_SEGMENT_COUNT + 9)
        const meleeIds = new Set(entriesOf('近战攻击').map(entry => entry.id))
        const rangedIds = new Set(entriesOf('远程攻击').map(entry => entry.id))
        expect(meleeIds).toEqual(segmentIdsOf(Object.values(MELEE_WEAPON_PRESETS)))
        expect(rangedIds).toEqual(segmentIdsOf(Object.values(RANGED_WEAPON_PRESETS)))
    })

    it('分组按展示顺序排列，且每项都归属已知分组', () => {
        const groups = [...new Set(getBuiltinClips().map(entry => entry.group))]
        expect(groups).toEqual([...BUILTIN_CLIP_GROUP_ORDER])
    })

    it('基础状态含待机/行走的空手与持械两种变体', () => {
        const labels = entriesOf('基础状态').map(entry => entry.label)
        expect(labels).toContain('待机（空手）')
        expect(labels).toContain('待机（持械）')
        expect(labels).toContain('行走（空手）')
        expect(labels).toContain('行走（持械）')
        expect(labels).toContain('跳跃')
        expect(labels).toContain('下落')
        expect(labels).toContain('死亡')
        expect(labels).toContain('翻滚')
        expect(labels).toContain('受击硬直')
    })

    it('近战条目按武器 + 持握模式分组，每模式内先主干段（按链编排）后变体段', () => {
        const labels = entriesOf('近战攻击').map(entry => entry.label)
        /* 期望顺序 = 武器 × 模式 × 段展示顺序（标签带模式名） */
        const expected: string[] = []
        for (const weapon of Object.values(MELEE_WEAPON_PRESETS)) {
            for (const mode of weapon.holdModes) {
                const segments = orderedSegments(weaponAttacksOf(weapon, mode))
                for (const segment of segments) {
                    const display = segment.label ?? `${segment.key === 'light' ? '轻击' : '重击'}${['一', '二', '三'][segment.step - 1] ?? segment.step}段`
                    expected.push(`${weapon.name} · ${HOLD_MODE_LABELS[mode]} · ${display}`)
                }
            }
        }
        expect(labels).toEqual(expected)
    })

    it('攻击条目带武器 / 段 / 持握模式来源（编辑器据此自动装备武器）；基础状态条目不带', () => {
        const attacks = [...entriesOf('近战攻击'), ...entriesOf('远程攻击')]
        for (const entry of attacks) {
            expect(entry.weaponId, entry.label).toBeDefined()
            expect(entry.segmentId, entry.label).toBe(entry.id)
            expect(entry.holdMode, entry.label).toBeDefined()
        }
        for (const entry of entriesOf('基础状态')) {
            expect(entry.weaponId).toBeUndefined()
            expect(entry.segmentId).toBeUndefined()
            expect(entry.holdMode).toBeUndefined()
        }
        expect(findBuiltinClip('heavy_sword_two_handed_light_3')?.weaponId).toBe('heavy_sword')
        expect(findBuiltinClip('long_sword_one_handed_heavy_1')?.segmentId).toBe('long_sword_one_handed_heavy_1')
        expect(findBuiltinClip('longbow_shot')?.weaponId).toBe('longbow')
        expect(findBuiltinClip('long_sword_dual_wield_light_1')?.holdMode).toBe('dual_wield')
    })

    it('id 与显示名（载入动画库后的 clip 名）全库唯一', () => {
        const library = getBuiltinClips()
        expect(new Set(library.map(entry => entry.id)).size).toBe(library.length)
        expect(new Set(library.map(entry => entry.label)).size).toBe(library.length)
        expect(new Set(library.map(entry => entry.clip.name)).size).toBe(library.length)
    })

    it('clip 名 = 显示名，时长 > 0，轨道记录按时间升序且末帧落在时长处', () => {
        for (const entry of getBuiltinClips()) {
            const clip = entry.clip
            expect(clip.name).toBe(entry.label)
            expect(clip.duration).toBeGreaterThan(0)
            for (const track of clip.jointTracks) {
                expect(track.records.length).toBeGreaterThan(1)
                const times = track.records.map(record => record.time)
                expect([...times].sort((a, b) => a - b)).toEqual(times)
                expect(Math.abs(times[times.length - 1] - clip.duration)).toBeLessThan(1e-6)
            }
        }
    })

    it('全部轨道目标都是预设骨架的关节（根关节 id 统一为 root，无需重定向）', () => {
        const jointIds = new Set(buildCharacterSkeletonDefinition().joints.map(joint => joint.id))
        for (const entry of getBuiltinClips()) {
            const targets = entry.clip.jointTracks.map(track => track.targetId)
            expect(targets).toContain('root')
            expect(targets).not.toContain('group')
            for (const targetId of targets) {
                expect(jointIds.has(targetId)).toBe(true)
            }
        }
    })

    it('首帧关节静止位置与预设骨架定义一致（可直接播放不漂移）', () => {
        const positions = presetPositions()
        for (const entry of getBuiltinClips()) {
            for (const track of entry.clip.jointTracks) {
                const presetPos = positions.get(track.targetId)
                expect(presetPos).toBeDefined()
                const first = [...track.records].sort((a, b) => a.time - b.time)[0]
                expect(first.position.distanceTo(presetPos!)).toBeLessThan(1e-6)
            }
        }
    })

    it('攻击条目带 hitbox_on / hitbox_off 事件轨（时间同生产窗口）', () => {
        const attacks = [...entriesOf('近战攻击'), ...entriesOf('远程攻击')]
        /* 全部武器 × 全部持握模式的攻击段 */
        expect(attacks.length).toBe(MELEE_SEGMENT_COUNT + 9)
        for (const entry of attacks) {
            const records = entry.clip.eventTracks[0]?.records ?? []
            const names = records.map(record => record.eventName)
            /* 双持主/副手各一对事件；其余模式仅主手一对 */
            expect(names).toEqual(records.length === 4
                ? ['hitbox_on', 'hitbox_off', 'hitbox_on', 'hitbox_off']
                : ['hitbox_on', 'hitbox_off'])
            for (const record of records) {
                expect(record.time).toBeGreaterThanOrEqual(0)
                expect(record.time).toBeLessThanOrEqual(entry.clip.duration)
            }
        }
        const lightOne = findBuiltinClip('long_sword_one_handed_light_1')
        expect(lightOne).toBeDefined()
        const records = lightOne!.clip.eventTracks[0].records
        /* 命中窗口对齐打击帧：on ≈ 0.5×动作时间、off ≈ 0.95×动作时间（轻段动作时间 = 0.267s） */
        expect(records[0].time).toBeCloseTo(0.133, 6)
        expect(records[1].time).toBeCloseTo(0.253, 6)
    })

    it('行走 clip 采样出实际姿态变化（腿摆动），且待机持械/空手姿态不同', () => {
        const walking = findBuiltinClip('state/walking')!.clip
        const quarter = sampleClip(walking, walking.duration * 0.25)
        const legHip = quarter.jointPoses.get('rightLegHip')
        expect(legHip).toBeDefined()
        expect(Math.abs(legHip!.rotation.x)).toBeGreaterThan(0.1)

        const idleBare = findBuiltinClip('state/idle')!.clip
        const idleHeld = findBuiltinClip('state/idle_held')!.clip
        const bare = sampleClip(idleBare, 0).jointPoses.get('rightArmShoulder')
        const held = sampleClip(idleHeld, 0).jointPoses.get('rightArmShoulder')
        expect(bare).toBeDefined()
        expect(held).toBeDefined()
        expect(bare!.rotation.angleTo(held!.rotation)).toBeGreaterThan(0.1)
    })

    it('惰性构建并缓存（重复取用返回同一集合）', () => {
        expect(getBuiltinClips()).toBe(getBuiltinClips())
    })
})
