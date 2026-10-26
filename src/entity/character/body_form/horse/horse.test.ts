import {describe, it, expect} from 'vitest'
import {BASE_CLIP_STATES} from '../../../../character/state_machine/types.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../../../character/weapon/catalog.ts'
import {bodyFormOf, isKnownBodyFormId} from '../../body_form/index.ts'
import {HORSE_BODY_FORM} from './body_form.ts'
import {HORSE_COLLIDER_LAYOUT, buildHorseSkeleton} from './skeleton/skeleton.ts'
import {horseAttackClip, horseBaseClip} from './skeleton_animation/clips.ts'
import {horsePose} from './skeleton_animation/pose_fns.ts'

const STATES = BASE_CLIP_STATES

describe('马体形（forms/horse）', () => {
    it('骨架含球节 / 飞节 / 三节尾 / 耳骨', () => {
        expect(isKnownBodyFormId('horse')).toBe(true)
        expect(bodyFormOf('horse')).toBe(HORSE_BODY_FORM)
        const ids = new Set(buildHorseSkeleton().joints.map(joint => joint.id))
        for (const id of ['flFetlock', 'frFetlock', 'rlHock', 'rrHock', 'tailC', 'earL', 'earR', 'flFoot', 'rrFoot']) {
            expect(ids.has(id), id).toBe(true)
        }
    })

    it('碰撞布局：足底主胶囊 + 随躯干/颈部旋转的贴合碰撞体', () => {
        const definition = buildHorseSkeleton()
        const ids = new Set(definition.joints.map(joint => joint.id))
        expect(HORSE_COLLIDER_LAYOUT[0]?.nodeId).toBe('groundCollider')
        expect(HORSE_COLLIDER_LAYOUT[0]?.kind).toBe('capsule')
        for (const collider of HORSE_COLLIDER_LAYOUT) expect(ids.has(collider.nodeId), collider.nodeId).toBe(true)
        expect(definition.joints.find(joint => joint.id === 'bodyCollider')?.parentId).toBe('body')
        expect(definition.joints.find(joint => joint.id === 'headCollider')?.parentId).toBe('neck')
    })

    it('武器表仅保留天然铁蹄，且归属本体', () => {
        expect(HORSE_BODY_FORM.defaultWeaponLoadout.hooves).toBe('horse_iron_hoof')
        expect(new Set(HORSE_BODY_FORM.weapons.map(w => w.id))).toEqual(new Set(['horse_iron_hoof']))
        expect(HORSE_BODY_FORM.weapons.every(w => w.formId === HORSE_BODY_FORM.id)).toBe(true)
        expect(findWeaponPreset('horse_iron_hoof')?.natural).toBe(true)
        expect(findWeaponPreset('horse_head_blade')).toBeUndefined()
    })

    it('轻击为前踢 → 后踹，重击为单段蓄力践踏；命中挂点按蹄切换', () => {
        const weapon = findWeaponPreset('horse_iron_hoof')
        if (weapon === undefined) throw new Error('铁蹄未注册')
        const attacks = weaponAttacksOf(weapon)
        expect(attacks.chains.light.steps).toHaveLength(2)
        expect(attacks.chains.heavy.steps).toHaveLength(1)
        const light1 = attacks.segments[attacks.chains.light.steps[0]]
        const light2 = attacks.segments[attacks.chains.light.steps[1]]
        const heavy = attacks.segments[attacks.chains.heavy.steps[0]]
        expect(light1?.hitMountJointIds).toEqual(['flFoot', 'frFoot'])
        expect(light2?.hitMountJointIds).toEqual(['rlFoot', 'rrFoot'])
        expect(heavy?.hitMountJointIds).toEqual(['flFoot', 'frFoot'])
        expect(heavy?.chargeFullTime).toBeGreaterThan(0)
    })

    it('基础 clip 全部可烘焙，前后踢 / 践踏 clip 时长不同', () => {
        for (const state of STATES) {
            const clip = horseBaseClip(state)
            expect(clip.duration, state).toBeGreaterThan(0)
        }
        const weapon = findWeaponPreset('horse_iron_hoof')
        if (weapon === undefined) throw new Error('铁蹄未注册')
        const attacks = weaponAttacksOf(weapon)
        const front = horseAttackClip(attacks.segments[attacks.chains.light.steps[0]!]!)
        const rear = horseAttackClip(attacks.segments[attacks.chains.light.steps[1]!]!)
        const stomp = horseAttackClip(attacks.segments[attacks.chains.heavy.steps[0]!]!)
        expect(front.jointTracks.length).toBeGreaterThan(0)
        expect(rear.jointTracks.length).toBeGreaterThan(0)
        expect(stomp.duration).toBeGreaterThan(front.duration)
    })

    it('奔跑（bound）时左右腿同相摆动，不再四拍交错', () => {
        const pose = horsePose('sprinting')(0.37, 1)
        expect(pose.flHip).toEqual(pose.frHip)
        expect(pose.rlHip).toEqual(pose.rrHip)
        expect(pose.flKnee).toEqual(pose.frKnee)
        expect(pose.rlKnee).toEqual(pose.rrKnee)
    })
})
