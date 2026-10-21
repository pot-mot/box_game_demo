import {describe, it, expect} from 'vitest'
import {Euler, Vector3} from 'three'
import type {CharacterState} from '../../../../character/state_machine/types.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../../../character/weapon/catalog.ts'
import {bodyFormOf, isKnownBodyFormId} from '../../body_form/index.ts'
import {buildWolfSkeleton} from './skeleton.ts'
import {WOLF_BODY_FORM} from './body_form.ts'
import {wolfAttackClip, wolfBaseClip} from './clips.ts'
import {WOLF_HURT_BLOCKS} from './hurt.ts'
import {wolfAttackPose} from './pose_fns.ts'
import {isPoseWithPosition, type JointPose} from '../creature_runtime/pose.ts'

const STATES: readonly CharacterState[] = [
    'idle', 'walking', 'jumping', 'falling', 'swimming', 'floating', 'dying',
    'rolling', 'flinching', 'knockdown', 'getting_up', 'blocking', 'guard_broken', 'interacting',
]

describe('狼体形（forms/wolf）', () => {
    it('已注册且骨架含四足 / 口部挂点 / 碰撞节点', () => {
        expect(isKnownBodyFormId('wolf')).toBe(true)
        expect(bodyFormOf('wolf')).toBe(WOLF_BODY_FORM)
        const ids = new Set(buildWolfSkeleton().joints.map(joint => joint.id))
        for (const id of ['root', 'body', 'bodyCollider', 'neck', 'head', 'jaw', 'mouthMount', 'tailA', 'flHip', 'frHip', 'rlHip', 'rrHip']) {
            expect(ids.has(id), id).toBe(true)
        }
    })

    it('受击子块关节均在骨架内', () => {
        const ids = new Set(buildWolfSkeleton().joints.map(joint => joint.id))
        expect(WOLF_HURT_BLOCKS.length).toBeGreaterThan(0)
        for (const block of WOLF_HURT_BLOCKS) {
            expect(ids.has(block.jointId), block.id).toBe(true)
        }
    })

    it('模型构建：口部挂点存在；装备天然武器（空手网格）后 weaponGroup 非空', () => {
        const model = WOLF_BODY_FORM.createModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
        expect(model.jointGroups.get('mouthMount')).toBeDefined()
        expect(model.weaponGroup).toBeNull()
        model.equipWeapon({main: {id: 'none'}})
        expect(model.weaponGroup).not.toBeNull()
        model.dispose()
    })

    it('各状态基础 clip 均烘焙出时长 > 0 且轨道目标为骨架关节', () => {
        const jointIds = new Set(buildWolfSkeleton().joints.map(joint => joint.id))
        for (const state of STATES) {
            const clip = wolfBaseClip(state)
            expect(clip.duration, state).toBeGreaterThan(0)
            for (const track of clip.jointTracks) {
                expect(jointIds.has(track.targetId), `${state}:${track.targetId}`).toBe(true)
                expect(track.records.length, `${state}:${track.targetId}`).toBeGreaterThan(1)
            }
        }
    })

    it('攻击 clip 带命中窗口事件轨（on 早于 off）', () => {
        const bite = findWeaponPreset('wolf_bite')
        if (bite === undefined) throw new Error('wolf_bite 未注册')
        const attacks = weaponAttacksOf(bite)
        const segment = attacks.segments[attacks.chains.light.entries[0].segmentId]
        const clip = wolfAttackClip(segment)
        const records = clip.eventTracks[0].records
        expect(records.map(record => record.eventName)).toEqual(['hitbox_on', 'hitbox_off'])
        expect(records[0].time).toBeLessThan(records[1].time)
        expect(records[1].time).toBeLessThanOrEqual(clip.duration)
    })

    it('天然撕咬为默认武器且武器表仅撕咬 + 口含短剑 / 长剑', () => {
        expect(WOLF_BODY_FORM.defaultWeaponId).toBe('wolf_bite')
        expect(WOLF_BODY_FORM.weapons.map(w => w.id)).toEqual(['wolf_bite', 'wolf_short_sword', 'wolf_long_sword'])
    })

    it('口含剑横咬：刃身朝前（+Z）且刃面水平', () => {
        const weapon = findWeaponPreset('wolf_long_sword')
        if (weapon === undefined || weapon.type !== 'melee') throw new Error('wolf_long_sword 未注册')
        const rotation = weapon.mountRotation
        if (rotation === undefined) throw new Error('口含剑缺少挂点旋转')
        const euler = new Euler(rotation[0], rotation[1], rotation[2], 'XYZ')
        const blade = new Vector3(0, 1, 0).applyEuler(euler)
        expect(blade.z).toBeGreaterThan(0.95)
        expect(Math.abs(blade.x)).toBeLessThan(0.05)
        /* 刃宽（本地 Z）应落在水平面，而不是竖起来 */
        const width = new Vector3(0, 0, 1).applyEuler(euler)
        expect(Math.abs(width.y)).toBeLessThan(0.05)
    })

    it('攻击 clip 覆盖完整骨架，仅口部武器挂点保留装备旋转', () => {
        const weapon = findWeaponPreset('wolf_long_sword')
        if (weapon === undefined) throw new Error('wolf_long_sword 未注册')
        const attacks = weaponAttacksOf(weapon)
        const expected = buildWolfSkeleton().joints.map(joint => joint.id).filter(id => id !== 'mouthMount')
        for (const key of ['light', 'heavy', 'air'] as const) {
            for (const id of attacks.chains[key].steps) {
                const clip = wolfAttackClip(attacks.segments[id]!)
                const covered = new Set(clip.jointTracks.map(track => track.targetId))
                expect(expected.filter(jointId => !covered.has(jointId)), id).toEqual([])
                expect(covered.has('mouthMount')).toBe(false)
            }
        }
    })

    it('攻击收招时清除扭头 / 蓄势旋转残留（剑轻击与重击旋斩）', () => {
        const weapon = findWeaponPreset('wolf_long_sword')
        if (weapon === undefined) throw new Error('wolf_long_sword 未注册')
        const attacks = weaponAttacksOf(weapon)
        const normalise = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle))
        const yawOf = (pose: JointPose): number => isPoseWithPosition(pose) ? pose.rotation[1] : pose[1]

        const light = attacks.segments[attacks.chains.light.steps[0]!]!
        const lightEnd = wolfAttackPose(light)(light.duration + light.recovery, light.duration + light.recovery)
        expect(Math.abs(normalise(yawOf(lightEnd.body!)))).toBeLessThan(1e-6)
        expect(Math.abs(normalise(yawOf(lightEnd.neck!)))).toBeLessThan(1e-6)
        expect(Math.abs(normalise(yawOf(lightEnd.head!)))).toBeLessThan(1e-6)

        const heavy = attacks.segments[attacks.chains.heavy.steps[0]!]!
        const heavyEnd = wolfAttackPose(heavy)(heavy.duration + heavy.recovery, heavy.duration + heavy.recovery)
        expect(Math.abs(normalise(yawOf(heavyEnd.body!)))).toBeLessThan(1e-6)
        expect(Math.abs(normalise(yawOf(heavyEnd.head!)))).toBeLessThan(1e-6)
    })
})
