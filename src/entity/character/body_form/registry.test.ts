import {describe, it, expect} from 'vitest'
import {BODY_FORMS, BODY_FORM_IDS, HUMANOID_BODY_FORM, HUMANOID_BODY_FORM_ID, WOLF_BODY_FORM, WOLF_BODY_FORM_ID, bodyFormOf, isKnownBodyFormId} from './index.ts'
import {isKnownWeaponId} from '../../../character/weapon/weapon_runtime.ts'

describe('体形计划注册表', () => {
    it('humanoid 已注册且为合法 id', () => {
        expect(BODY_FORM_IDS).toContain(HUMANOID_BODY_FORM_ID)
        expect(isKnownBodyFormId(HUMANOID_BODY_FORM_ID)).toBe(true)
        expect(BODY_FORMS[HUMANOID_BODY_FORM_ID]).toBe(HUMANOID_BODY_FORM)
    })

    it('未知 / 缺省 id 安全回退人形', () => {
        expect(bodyFormOf(undefined)).toBe(HUMANOID_BODY_FORM)
        expect(bodyFormOf('does_not_exist')).toBe(HUMANOID_BODY_FORM)
    })

    it('人形肢体槽挂载其顶替的全部肢体段', () => {
        const arms = HUMANOID_BODY_FORM.equipSlots.find(slot => slot.kind === 'limb' && slot.bodyPart === 'arms')
        const legs = HUMANOID_BODY_FORM.equipSlots.find(slot => slot.kind === 'limb' && slot.bodyPart === 'legs')
        expect(arms?.mountJointIds).toEqual(expect.arrayContaining([
            'rightArmShoulder', 'rightArmElbow', 'rightHandPivot',
            'leftArmShoulder', 'leftArmElbow', 'leftHandPivot',
        ]))
        expect(legs?.mountJointIds).toEqual(expect.arrayContaining([
            'rightLegHip', 'rightLegKnee', 'leftLegHip', 'leftLegKnee',
        ]))
    })

    it('humanoid 尺寸 / 中心偏移 / 眼高关系自洽', () => {
        const {width, height, depth} = HUMANOID_BODY_FORM.base.size
        expect(width).toBeGreaterThan(0)
        expect(height).toBeGreaterThan(0)
        expect(depth).toBeGreaterThan(0)
        expect(HUMANOID_BODY_FORM.base.centerOffsetY).toBeCloseTo(height / 2, 10)
        expect(HUMANOID_BODY_FORM.base.eyeHeight).toBeGreaterThan(0)
        expect(HUMANOID_BODY_FORM.base.eyeHeight).toBeLessThan(height)
    })

    it('humanoid 碰撞布局为两个等半径半胶囊', () => {
        const layout = HUMANOID_BODY_FORM.skeleton.colliderLayout
        expect(layout).toHaveLength(2)
        const capsules = layout.filter(spec => spec.kind === 'capsule')
        expect(capsules).toHaveLength(2)
        const [first, second] = capsules
        if (first === undefined || second === undefined) return
        expect(first.radius).toBeCloseTo(second.radius, 10)
        expect(first.radius).toBeLessThanOrEqual(HUMANOID_BODY_FORM.base.size.width / 2)
        expect(first.offsetY).toBeCloseTo(-second.offsetY, 10)
    })

    it('humanoid 受击子块 id 唯一且非空', () => {
        const ids = HUMANOID_BODY_FORM.skeleton.hurtProfile.map(b => b.id)
        expect(ids.length).toBeGreaterThan(0)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('humanoid 默认武器为已知武器 id', () => {
        expect(isKnownWeaponId(HUMANOID_BODY_FORM.defaultWeaponId)).toBe(true)
    })
})

describe('狼体形计划', () => {
    it('已注册且默认武器为已知 id', () => {
        expect(BODY_FORM_IDS).toContain(WOLF_BODY_FORM_ID)
        expect(BODY_FORMS[WOLF_BODY_FORM_ID]).toBe(WOLF_BODY_FORM)
        expect(isKnownWeaponId(WOLF_BODY_FORM.defaultWeaponId)).toBe(true)
    })

    it('装备槽覆盖爪 / 头 / 躯干 / 腿 / 尾与武器槽', () => {
        const has = (kind: string, bodyPart: string): boolean =>
            WOLF_BODY_FORM.equipSlots.some(slot => slot.kind === kind && slot.bodyPart === bodyPart)
        for (const part of ['claw', 'head', 'torso', 'legs']) {
            expect(has('limb', part), part).toBe(true)
            expect(has('armor', part), part).toBe(true)
        }
        expect(has('limb', 'tail')).toBe(true)
        expect(has('armor', 'tail')).toBe(false)
        expect(has('weapon', 'claw')).toBe(true)
        expect(has('weapon', 'head')).toBe(true)
        expect(has('weapon', 'main_hand')).toBe(false)
    })

    it('天然撕咬为默认武器，武器表全部归属狼体形且包含撕咬', () => {
        expect(WOLF_BODY_FORM.defaultWeaponId).toBe('wolf_bite')
        expect(WOLF_BODY_FORM.weapons.every(w => w.formId === WOLF_BODY_FORM.id)).toBe(true)
        expect(WOLF_BODY_FORM.weapons.map(w => w.id)).toContain('wolf_bite')
    })

    it('四足骨架尺寸与中心偏移自洽（与人形不同）', () => {
        expect(WOLF_BODY_FORM.base.centerOffsetY).toBeGreaterThan(0)
        expect(WOLF_BODY_FORM.base.centerOffsetY).not.toBeCloseTo(HUMANOID_BODY_FORM.base.centerOffsetY, 3)
        expect(WOLF_BODY_FORM.skeleton.colliderLayout.length).toBeGreaterThanOrEqual(2)
    })
})
