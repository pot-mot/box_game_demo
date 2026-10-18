import {describe, it, expect} from 'vitest'
import type {CharacterState} from '../../../../character/state_machine/types.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../../../character/weapon/catalog.ts'
import {bodyFormOf, isKnownBodyFormId} from '../../body_form/index.ts'
import {buildWolfSkeleton} from './skeleton.ts'
import {WOLF_BODY_FORM} from './body_form.ts'
import {wolfAttackClip, wolfBaseClip} from './clips.ts'
import {WOLF_HURT_BLOCKS} from './hurt.ts'

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
})
