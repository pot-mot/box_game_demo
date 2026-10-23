import {describe, it, expect} from 'vitest'
import {findWeaponPreset, weaponsOfForm} from '../../../../../character/weapon/catalog.ts'
import {ATTACK_CLIPS} from '../skeleton_animation/attack_clips/index.ts'
import {HUMANOID_BODY_FORM_ID} from '../../index.ts'

const SHIELD_CLASS_IDS = weaponsOfForm(HUMANOID_BODY_FORM_ID)
    .filter(weapon => weapon.type === 'melee' && weapon.block !== undefined)
    .map(weapon => weapon.classId)

describe('人形近战武器（体形拥有 + 注册表查询）', () => {
    it('武器归属人形体形，且可在注册表按 id 查回同一实例', () => {
        for (const weapon of weaponsOfForm(HUMANOID_BODY_FORM_ID)) {
            expect(weapon.formId, weapon.id).toBe(HUMANOID_BODY_FORM_ID)
            expect(findWeaponPreset(weapon.id), weapon.id).toBe(weapon)
        }
    })

    it('普通近战类声明三持握模式且默认单持；盾类（有 block）与天然空手仅单持', () => {
        for (const weapon of weaponsOfForm(HUMANOID_BODY_FORM_ID)) {
            if (weapon.type !== 'melee') continue
            const expected = weapon.block !== undefined || weapon.natural === true
                ? ['one_handed']
                : ['one_handed', 'two_handed', 'dual_wield']
            expect(weapon.holdModes, weapon.id).toEqual(expected)
        }
    })

    it('盾类：声明 block 配置、轻/重攻击链含盾击 / 盾撞四段，且攻击 clip 可解析', () => {
        for (const classId of SHIELD_CLASS_IDS) {
            const config = findWeaponPreset(classId)
            expect(config, classId).toBeDefined()
            if (config === undefined || config.type !== 'melee') continue
            expect(config.block, classId).toBeDefined()
            expect(config.block?.guardMax ?? 0, classId).toBeGreaterThan(0)
            const attacks = config.attacks.one_handed
            expect(attacks, classId).toBeDefined()
            if (attacks === undefined) continue
            const segments = attacks.segments
            for (const key of ['light_1', 'light_2', 'heavy_1', 'heavy_2']) {
                const segmentId = `${classId}_one_handed_${key}`
                expect(segments[segmentId], segmentId).toBeDefined()
                expect(ATTACK_CLIPS[segmentId], segmentId).toBeDefined()
            }
        }
    })

    it('盾类 block 经解析贯通到武器预设（模型解析不丢格挡配置）', () => {
        for (const classId of SHIELD_CLASS_IDS) {
            const weapon = findWeaponPreset(classId)
            expect(weapon?.type === 'melee' ? weapon.block : undefined, classId).toBeDefined()
        }
    })
})
