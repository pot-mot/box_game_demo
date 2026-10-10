import {describe, it, expect} from 'vitest'
import {MELEE_WEAPON_CLASSES, MELEE_WEAPON_MODELS, resolveMeleeWeapon} from './melee_weapon.ts'

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

    it('全部近战类声明三持握模式且默认单持', () => {
        for (const classId of Object.keys(MELEE_WEAPON_CLASSES)) {
            expect(MELEE_WEAPON_CLASSES[classId].holdModes, classId).toEqual(['one_handed', 'two_handed', 'dual_wield'])
        }
    })
})
