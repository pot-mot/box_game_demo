import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {BUILTIN_CLIP_GROUP_ORDER, BASE_STATE_ORDER, findBuiltinClip, getBuiltinClips} from './builtin_clips.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/character/body_form/humanoid/skeleton/skeleton.ts'
import {sampleClip} from '../../skeleton/anim/sampling.ts'
import {orderedSegments} from '../../character/weapon/attack_chain.ts'
import {weaponAttacksOf, weaponsOfForm, type WeaponConfig} from '../../character/weapon/catalog.ts'
import {
    BODY_FORM_IDS,
    HORSE_BODY_FORM_ID,
    HUMANOID_BODY_FORM_ID,
    WOLF_BODY_FORM_ID,
    WYVERN_BODY_FORM_ID,
} from '../../entity/character/body_form/index.ts'
import {buildWolfSkeleton} from '../../entity/character/body_form/wolf/skeleton/skeleton.ts'
import {buildHorseSkeleton} from '../../entity/character/body_form/horse/skeleton/skeleton.ts'
import {buildWyvernSkeleton} from '../../entity/character/body_form/wyvern/skeleton/skeleton.ts'
import type {BuiltinClipEntry} from './builtin_clips.ts'
import {BASE_CLIP_STATES} from '../../character/state_machine/types.ts'

const entriesOf = (group: string): readonly BuiltinClipEntry[] =>
    getBuiltinClips().filter(entry => entry.group === group)

/** 武器模组声明的全部攻击段 id（全部持握模式，与内置动作库同一枚举顺序） */
const segmentIdsOf = (weapons: readonly WeaponConfig[]): ReadonlySet<string> =>
    new Set(weapons.flatMap(weapon =>
        weapon.attackModules.flatMap(module => orderedSegments(weaponAttacksOf(weapon, module.id)).map(segment => segment.id)),
    ))

/** 人形动作库覆盖全部人形武器（含天然武器空手） */
const HUMANOID_WEAPONS = weaponsOfForm(HUMANOID_BODY_FORM_ID)
const MELEE_PRESETS = HUMANOID_WEAPONS.filter(weapon => weapon.type === 'melee')
const RANGED_PRESETS = HUMANOID_WEAPONS.filter(weapon => weapon.type === 'ranged')

/** 近战武器全部攻击段总数（6 武器 × 3 模式；巨剑/长枪双手链各多一段） */
const MELEE_SEGMENT_COUNT = MELEE_PRESETS
    .reduce((sum, weapon) => sum + weapon.attackModules
        .reduce((moduleSum, module) => moduleSum + orderedSegments(weaponAttacksOf(weapon, module.id)).length, 0), 0)

const presetPositions = (): ReadonlyMap<string, Vector3> => {
    const definition = buildCharacterSkeletonDefinition()
    return new Map(definition.joints.map(joint => [joint.id, new Vector3().fromArray([...joint.position])]))
}

describe('骨骼编辑器内置动作库（getBuiltinClips）', () => {
    it('每个注册体形都有内置动作 provider', () => {
        for (const formId of BODY_FORM_IDS) {
            expect(getBuiltinClips(formId).length, formId).toBeGreaterThan(0)
        }
    })

    it('基础状态顺序与 BASE_CLIP_STATES 完全一致（新增状态不会漏出编辑器）', () => {
        expect(new Set(BASE_STATE_ORDER)).toEqual(new Set(BASE_CLIP_STATES))
        const built = getBuiltinClips().filter(entry => entry.id.startsWith('state/'))
        const states = new Set(built.map(entry => entry.id.replace(/^state\//, '').replace(/_held$/, '')))
        expect([...BASE_CLIP_STATES].filter(state => !states.has(state))).toEqual([])
    })

    it('覆盖全部基础状态与全部武器的攻击段（含全部持握模式）', () => {
        const library = getBuiltinClips()
        const baseEntries = entriesOf('基础状态')
        const expectedBaseIds = new Set(BASE_STATE_ORDER.flatMap(state =>
            (state === 'idle' || state === 'walking' || state === 'sprinting' || state === 'flying')
                ? [`state/${state}`, `state/${state}_held`]
                : [`state/${state}`],
        ))
        expect(new Set(baseEntries.map(entry => entry.id))).toEqual(expectedBaseIds)
        const meleeIds = new Set(entriesOf('近战攻击').map(entry => entry.id))
        const rangedIds = new Set(entriesOf('远程攻击').map(entry => entry.id))
        expect(meleeIds).toEqual(segmentIdsOf(MELEE_PRESETS))
        expect(rangedIds).toEqual(segmentIdsOf(RANGED_PRESETS))
        expect(library.length).toBe(baseEntries.length + meleeIds.size + rangedIds.size)
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
            expect(entry.attackModule, entry.label).toBeDefined()
        }
        for (const entry of entriesOf('基础状态')) {
            expect(entry.weaponId).toBeUndefined()
            expect(entry.segmentId).toBeUndefined()
            expect(entry.attackModule).toBeUndefined()
        }
        expect(findBuiltinClip('heavy_sword_two_handed_light_3')?.weaponId).toBe('heavy_sword')
        expect(findBuiltinClip('long_sword_one_handed_heavy_1')?.segmentId).toBe('long_sword_one_handed_heavy_1')
        expect(findBuiltinClip('longbow_shot')?.weaponId).toBe('longbow')
        expect(findBuiltinClip('long_sword_dual_wield_light_1')?.attackModule).toBe('dual_wield')
        expect(findBuiltinClip('unarmed_one_handed_light_1')?.weaponId).toBe('unarmed')
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
        expect(attacks.length).toBe(MELEE_SEGMENT_COUNT + RANGED_PRESETS.length)
        for (const entry of attacks) {
            const records = entry.clip.eventTracks[0]?.records ?? []
            const names = records.map(record => record.eventName)
            /* 双持主/副手各一对事件；其余模式仅主手一对。同帧镜像的双持允许两对窗口时间重合。 */
            expect(names.filter(name => name === 'hitbox_on').length).toBe(records.length === 4 ? 2 : 1)
            expect(names.filter(name => name === 'hitbox_off').length).toBe(records.length === 4 ? 2 : 1)
            const windows = new Map<string, {on?: number; off?: number}>()
            for (const record of records) {
                expect(record.time).toBeGreaterThanOrEqual(0)
                expect(record.time).toBeLessThanOrEqual(entry.clip.duration)
                const slot = String(record.params?.slotKey ?? 'weapon:main_hand')
                const window = windows.get(slot) ?? {}
                if (record.eventName === 'hitbox_on') window.on = record.time
                else if (record.eventName === 'hitbox_off') window.off = record.time
                windows.set(slot, window)
            }
            for (const window of windows.values()) {
                expect(window.on).toBeDefined()
                expect(window.off).toBeDefined()
                expect(window.on!).toBeLessThan(window.off!)
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

    it('狼 / 马 / 飞龙也拥有各自的内置基础状态与攻击动作，且轨道目标匹配自身骨架', () => {
        const forms: readonly (readonly [string, () => ReturnType<typeof buildWolfSkeleton>])[] = [
            [WOLF_BODY_FORM_ID, buildWolfSkeleton],
            [HORSE_BODY_FORM_ID, buildHorseSkeleton],
            [WYVERN_BODY_FORM_ID, buildWyvernSkeleton],
        ]
        for (const [formId, buildSkeleton] of forms) {
            const library = getBuiltinClips(formId)
            expect(library.length, formId).toBeGreaterThan(0)
            expect(library.some(entry => entry.group === '基础状态'), formId).toBe(true)
            expect(library.some(entry => entry.group === '近战攻击'), formId).toBe(true)
            expect(new Set(library.map(entry => entry.id)).size, formId).toBe(library.length)
            const jointIds = new Set(buildSkeleton().joints.map(joint => joint.id))
            for (const entry of library) {
                for (const track of entry.clip.jointTracks) {
                    expect(jointIds.has(track.targetId), `${formId}:${entry.id}:${track.targetId}`).toBe(true)
                }
            }
        }
        /* 龙吐息为独立装备槽，也要能在编辑器里直接选择 */
        expect(getBuiltinClips(WYVERN_BODY_FORM_ID).map(entry => entry.id)).toEqual(expect.arrayContaining([
            'breath_fireball_blast', 'breath_lightning_blast', 'breath_laser_beam',
        ]))
    })

    it('惰性构建并缓存（重复取用返回同一集合）', () => {
        expect(getBuiltinClips()).toBe(getBuiltinClips())
    })
})
