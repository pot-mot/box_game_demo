import {describe, it, expect} from 'vitest'
import {findWeaponPreset, weaponsOfForm} from '../../../../../character/weapon/catalog.ts'
import {resolvePhases, phaseDurationOf} from '../../../../../character/combat/attack_phases.ts'
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

    it('空手排在近战武器第一项', () => {
        const melee = weaponsOfForm(HUMANOID_BODY_FORM_ID).filter(weapon => weapon.type === 'melee')
        expect(melee[0]?.id).toBe('unarmed')
    })

    it('普通近战类声明三持握模式且默认单持；盾类（有 block）与天然空手仅单持', () => {
        for (const weapon of weaponsOfForm(HUMANOID_BODY_FORM_ID)) {
            if (weapon.type !== 'melee') continue
            const expected = weapon.block !== undefined
                ? ['one_handed']
                : weapon.natural === true
                    ? ['one_handed', 'dual_wield']
                    : ['one_handed', 'two_handed', 'dual_wield']
            expect(weapon.attackModules.map(module => module.id), weapon.id).toEqual(expected)
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

describe('空手攻击箱', () => {
    it('拳头攻击箱缩小并拆到前臂 / 手两段关节', () => {
        const unarmed = findWeaponPreset('unarmed')
        if (unarmed === undefined || unarmed.type !== 'melee') throw new Error('空手未注册')
        expect(unarmed.attackBoxes.map(box => box.jointId)).toEqual(['forearm', 'hand'])
        for (const box of unarmed.attackBoxes) {
            expect(box.half.x).toBeLessThanOrEqual(0.06)
            expect(box.half.y).toBeLessThanOrEqual(0.1)
            expect(box.half.z).toBeLessThanOrEqual(0.07)
        }
    })
})

describe('盾牌攻击动作节奏', () => {
    it('大中小盾的盾击 / 盾撞均按 2:1:2.5 编排且整体放慢', () => {
        for (const id of ['shield_small', 'shield_medium', 'shield_large']) {
            const weapon = findWeaponPreset(id)
            if (weapon === undefined || weapon.type !== 'melee') throw new Error(`${id} 未注册`)
            for (const key of ['light', 'heavy'] as const) {
                const segment = weapon.attacks.one_handed!.segments[weapon.attacks.one_handed!.chains[key].steps[0]!]!
                const phases = resolvePhases(segment.phases)
                const windup = phases.find(phase => phase.name === 'windup')!
                const strike = phases.find(phase => phase.name === 'strike')!
                const windupDuration = phaseDurationOf(windup, segment.duration, segment.recovery)
                const strikeDuration = phaseDurationOf(strike, segment.duration, segment.recovery)
                expect(windupDuration / strikeDuration, `${id}/${key}`).toBeCloseTo(2, 5)
                expect(segment.recovery / strikeDuration, `${id}/${key}`).toBeCloseTo(2.5, 5)
            }
        }
    })
})
