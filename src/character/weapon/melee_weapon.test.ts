import {describe, it, expect} from 'vitest'
import {MELEE_WEAPON_CLASSES, MELEE_WEAPON_MODELS, MELEE_WEAPON_PRESETS, resolveMeleeWeapon} from './melee_weapon.ts'
import {SHIELD_CLASS_IDS} from './shield_clip_data.ts'
import {ATTACK_CLIP_JSON} from './attack_clip_data.ts'

describe('MELEE_WEAPON_PRESETS 武器类 / 模型分层', () => {
    it('武器类 / 模型分层：每个类恰好一个默认模型，解析结果合并类玩法与模型外观', () => {
        const classIds = Object.keys(MELEE_WEAPON_CLASSES)
        for (const classId of classIds) {
            const models = Object.values(MELEE_WEAPON_MODELS).filter(model => model.classId === classId)
            expect(models, classId).toHaveLength(1)
            const resolved = resolveMeleeWeapon(models[0])
            expect(resolved.id, classId).toBe(models[0].id)
            expect(resolved.name, classId).toBe(models[0].name)
            expect(resolved.mesh, classId).toBe(models[0].mesh)
            expect(resolved.damage, classId).toBe(MELEE_WEAPON_CLASSES[classId].damage)
            expect(resolved.attacks, classId).toBe(MELEE_WEAPON_CLASSES[classId].attacks)
        }
    })

    it('普通近战类声明三持握模式且默认单持；盾类（有 block）仅单持', () => {
        for (const classId of Object.keys(MELEE_WEAPON_CLASSES)) {
            const config = MELEE_WEAPON_CLASSES[classId]
            const expected = config.block !== undefined
                ? ['one_handed']
                : ['one_handed', 'two_handed', 'dual_wield']
            expect(config.holdModes, classId).toEqual(expected)
        }
    })

    it('盾类：声明 block 配置、轻/重攻击链含盾击 / 盾撞四段，且攻击 clip 可解析', () => {
        for (const classId of SHIELD_CLASS_IDS) {
            const config = MELEE_WEAPON_CLASSES[classId]
            expect(config.block, classId).toBeDefined()
            expect(config.block?.guardMax ?? 0, classId).toBeGreaterThan(0)
            const attacks = config.attacks.one_handed
            expect(attacks, classId).toBeDefined()
            if (attacks === undefined) continue
            const segments = attacks.segments
            for (const key of ['light_1', 'light_2', 'heavy_1', 'heavy_2']) {
                const segmentId = `${classId}_one_handed_${key}`
                expect(segments[segmentId], segmentId).toBeDefined()
                expect(ATTACK_CLIP_JSON[segmentId], segmentId).toBeDefined()
            }
        }
    })

    it('盾类 block 经 resolveMeleeWeapon 贯通到预设（模型解析不丢格挡配置）', () => {
        for (const classId of SHIELD_CLASS_IDS) {
            expect(MELEE_WEAPON_PRESETS[classId].block, classId).toBe(MELEE_WEAPON_CLASSES[classId].block)
        }
    })
})
