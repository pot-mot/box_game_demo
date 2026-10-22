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

    it('humanoid 尺寸 / 中心偏移 / 眼高关系自洽', () => {
        const {width, height, depth} = HUMANOID_BODY_FORM.size
        expect(width).toBeGreaterThan(0)
        expect(height).toBeGreaterThan(0)
        expect(depth).toBeGreaterThan(0)
        expect(HUMANOID_BODY_FORM.centerOffsetY).toBeCloseTo(height / 2, 10)
        expect(HUMANOID_BODY_FORM.eyeHeight).toBeGreaterThan(0)
        expect(HUMANOID_BODY_FORM.eyeHeight).toBeLessThan(height)
    })

    it('humanoid 碰撞布局为两个等半径半胶囊', () => {
        const layout = HUMANOID_BODY_FORM.colliderLayout
        expect(layout).toHaveLength(2)
        const capsules = layout.filter(spec => spec.kind === 'capsule')
        expect(capsules).toHaveLength(2)
        const [first, second] = capsules
        if (first === undefined || second === undefined) return
        expect(first.radius).toBeCloseTo(second.radius, 10)
        expect(first.radius).toBeLessThanOrEqual(HUMANOID_BODY_FORM.size.width / 2)
        expect(first.offsetY).toBeCloseTo(-second.offsetY, 10)
    })

    it('humanoid 受击子块 id 唯一且非空', () => {
        const ids = HUMANOID_BODY_FORM.hurtProfile.map(b => b.id)
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

    it('无护甲 / 肢体槽（体形固有外观），保留武器槽', () => {
        expect(WOLF_BODY_FORM.equipSlots.armor).toHaveLength(0)
        expect(WOLF_BODY_FORM.equipSlots.limb).toHaveLength(0)
        expect(WOLF_BODY_FORM.equipSlots.weapon).toBe(true)
    })

    it('天然撕咬为默认武器，武器表全部归属狼体形且包含撕咬', () => {
        expect(WOLF_BODY_FORM.defaultWeaponId).toBe('wolf_bite')
        expect(WOLF_BODY_FORM.weapons.every(w => w.formId === WOLF_BODY_FORM.id)).toBe(true)
        expect(WOLF_BODY_FORM.weapons.map(w => w.id)).toContain('wolf_bite')
    })

    it('四足骨架尺寸与中心偏移自洽（与人形不同）', () => {
        expect(WOLF_BODY_FORM.centerOffsetY).toBeGreaterThan(0)
        expect(WOLF_BODY_FORM.centerOffsetY).not.toBeCloseTo(HUMANOID_BODY_FORM.centerOffsetY, 3)
        expect(WOLF_BODY_FORM.colliderLayout.length).toBeGreaterThanOrEqual(2)
    })
})
