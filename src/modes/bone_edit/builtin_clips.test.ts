import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {BUILTIN_CLIP_GROUP_ORDER, BASE_STATE_ENTRY_COUNT, findBuiltinClip, getBuiltinClips} from './builtin_clips.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/character/skeleton/preset.ts'
import {sampleClip} from '../../skeleton/anim/sampling.ts'
import {MELEE_WEAPON_PRESETS} from '../../character/weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from '../../character/weapon/ranged_weapon.ts'
import {orderedSegments} from '../../character/weapon/attack_chain.ts'
import {weaponAttacksOf, type WeaponConfig} from '../../character/weapon/catalog.ts'
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
        /* 基础状态条目（含 idle/walking 变体）+ 近战全模式段 + 远程 9 */
        expect(library.length).toBe(BASE_STATE_ENTRY_COUNT + MELEE_SEGMENT_COUNT + 9)
        const meleeIds = new Set(entriesOf('近战攻击').map(entry => entry.id))
        const rangedIds = new Set(entriesOf('远程攻击').map(entry => entry.id))
        expect(meleeIds).toEqual(segmentIdsOf(Object.values(MELEE_WEAPON_PRESETS)))
        expect(rangedIds).toEqual(segmentIdsOf(Object.values(RANGED_WEAPON_PRESETS)))
    })

    it('分组按展示顺序排列，且每项都归属已知分组', () => {
        const groups = [...new Set(getBuiltinClips().map(entry => entry.group))]
        expect(groups).toEqual([...BUILTIN_CLIP_GROUP_ORDER])
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

    it('clip 时长 > 0，轨道记录按时间升序且末帧落在时长处', () => {
        for (const entry of getBuiltinClips()) {
            const clip = entry.clip
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

    it('攻击条目带 hitbox_on / hitbox_off 事件轨（on 早于 off 且落在时长内）', () => {
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
        /* 命中窗口 on 早于 off，且都落在动作时长内 */
        expect(records[0].time).toBeLessThan(records[1].time)
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
