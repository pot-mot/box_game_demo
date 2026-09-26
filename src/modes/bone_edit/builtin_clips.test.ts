import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {BUILTIN_CLIP_GROUP_ORDER, findBuiltinClip, getBuiltinClips} from './builtin_clips.ts'
import {buildCharacterSkeletonDefinition} from '../../entity/skeleton/preset.ts'
import {sampleClip} from '../../skeleton/anim/sampling.ts'
import {MELEE_WEAPON_PRESETS} from '../../character/weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from '../../character/weapon/ranged_weapon.ts'
import {orderedSegments} from '../../character/weapon/attack_chain.ts'
import {weaponAttacksOf, type WeaponConfig} from '../../character/weapon/catalog.ts'
import type {BuiltinClipEntry} from './builtin_clips.ts'

const entriesOf = (group: string): readonly BuiltinClipEntry[] =>
    getBuiltinClips().filter(entry => entry.group === group)

/** 武器模组声明的全部攻击段 id（与内置动作库同一枚举顺序） */
const segmentIdsOf = (weapons: readonly WeaponConfig[]): ReadonlySet<string> =>
    new Set(weapons.flatMap(weapon => orderedSegments(weaponAttacksOf(weapon)).map(segment => segment.id)))

const presetPositions = (): ReadonlyMap<string, Vector3> => {
    const definition = buildCharacterSkeletonDefinition()
    return new Map(definition.joints.map(joint => [joint.id, new Vector3().fromArray([...joint.position])]))
}

describe('骨骼编辑器内置动作库（getBuiltinClips）', () => {
    it('覆盖全部基础状态与全部武器的攻击段', () => {
        const library = getBuiltinClips()
        /* 基础状态 9 + 近战 26（4 段 × 4 武器 + 巨剑 5 段 + 长枪 5 段）+ 远程 9 */
        expect(library.length).toBe(9 + 26 + 9)
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
        expect(labels).toContain('冲刺')
        expect(labels).toContain('受击硬直')
    })

    it('近战条目按武器分组，每武器内先主干段（按链编排）后变体段', () => {
        const labels = entriesOf('近战攻击').map(entry => entry.label)
        /* 巨剑轻链 3 段、长枪多一个蓄力突刺变体，其余武器 4 段 */
        const expected: Readonly<Record<string, readonly string[]>> = {
            短剑: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
            长剑: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
            巨剑: ['轻击一段', '轻击二段', '轻击三段', '重击一段', '重击二段'],
            长枪: ['轻击一段', '轻击二段', '蓄力突刺', '重击一段', '重击二段'],
            双斧: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
            战锤: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
        }
        for (const [weapon, segmentLabels] of Object.entries(expected)) {
            const start = labels.indexOf(`${weapon} · ${segmentLabels[0]}`)
            expect(start, `${weapon} 应出现在清单中`).toBeGreaterThanOrEqual(0)
            expect(labels.slice(start, start + segmentLabels.length)).toEqual(segmentLabels.map(label => `${weapon} · ${label}`))
        }
        /* 武器之间不交叉：清单长度 = 各武器段数之和 */
        const total = Object.values(expected).reduce((sum, segmentLabels) => sum + segmentLabels.length, 0)
        expect(labels).toHaveLength(total)
    })

    it('攻击条目带武器与段来源（编辑器据此自动装备武器）；基础状态条目不带', () => {
        const attacks = [...entriesOf('近战攻击'), ...entriesOf('远程攻击')]
        for (const entry of attacks) {
            expect(entry.weaponId, entry.label).toBeDefined()
            expect(entry.segmentId, entry.label).toBe(entry.id)
        }
        for (const entry of entriesOf('基础状态')) {
            expect(entry.weaponId).toBeUndefined()
            expect(entry.segmentId).toBeUndefined()
        }
        expect(findBuiltinClip('heavy_sword_light_3')?.weaponId).toBe('heavy_sword')
        expect(findBuiltinClip('spear_charge_thrust')?.segmentId).toBe('spear_charge_thrust')
        expect(findBuiltinClip('longbow_shot')?.weaponId).toBe('longbow')
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
        /* 近战 26（巨剑轻链 3 段 + 长枪蓄力变体）+ 远程 9 */
        expect(attacks.length).toBe(35)
        for (const entry of attacks) {
            const records = entry.clip.eventTracks[0]?.records ?? []
            const names = records.map(record => record.eventName)
            /* 双持（双斧）主/副手各一对事件；其余武器仅主手一对 */
            expect(names).toEqual(records.length === 4
                ? ['hitbox_on', 'hitbox_off', 'hitbox_on', 'hitbox_off']
                : ['hitbox_on', 'hitbox_off'])
            for (const record of records) {
                expect(record.time).toBeGreaterThanOrEqual(0)
                expect(record.time).toBeLessThanOrEqual(entry.clip.duration)
            }
        }
        const lightOne = findBuiltinClip('long_sword_light_1')
        expect(lightOne).toBeDefined()
        const records = lightOne!.clip.eventTracks[0].records
        expect(records[0].time).toBeCloseTo(0.2 * 0.1, 6)
        expect(records[1].time).toBeCloseTo(0.2 * 0.85, 6)
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
