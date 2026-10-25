import {describe, expect, it} from 'vitest'
import {LineBasicMaterial, Scene} from 'three'
import {createCharacterDebugView} from './debug_view.ts'
import {bodyFormOf} from '../body_form/index.ts'
import {weaponPresetOrDefault} from '../../../character/weapon/catalog.ts'

describe('角色调试可视化基本能力', () => {
    it('默认全部隐藏；攻击箱未命中时 50% 不透明、激活时 100%', () => {
        const scene = new Scene()
        const form = bodyFormOf(undefined)
        const model = form.createModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const weapon = weaponPresetOrDefault('long_sword')
        model.equipWeapon({
            main: weapon.mesh,
            mainAttackBoxes: weapon.attackBoxes,
        })
        const view = createCharacterDebugView(scene, model)

        for (const kind of ['collision', 'attack', 'hurt', 'detect', 'vision'] as const) {
            expect(view.isVisible(kind)).toBe(false)
        }
        for (const mesh of model.colliderMeshes) expect(mesh.visible).toBe(false)

        view.setVisible('attack', true)
        view.syncAttack({ranged: false, offhandEnabled: false, projectileRadius: 0.1})
        expect(view.hitBoxes.weaponBoxes[0].visible).toBe(true)
        const material = view.hitBoxes.weaponBoxes[0].material
        expect(material instanceof LineBasicMaterial).toBe(true)
        if (material instanceof LineBasicMaterial) {
            expect(material.opacity).toBeCloseTo(0.5)
            view.setAttackActive(true)
            expect(material.opacity).toBe(1)
            view.setAttackActive(false)
            expect(material.opacity).toBeCloseTo(0.5)
        }

        view.setVisible('attack', false)
        expect(view.hitBoxes.weaponBoxes[0].visible).toBe(false)
        view.dispose()
        model.dispose()
    })

    it('碰撞箱开关同步模型自带的可视化胶囊', () => {
        const scene = new Scene()
        const model = bodyFormOf(undefined).createModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const view = createCharacterDebugView(scene, model)
        view.setVisible('collision', true)
        for (const mesh of model.colliderMeshes) expect(mesh.visible).toBe(true)
        view.setVisible('collision', false)
        for (const mesh of model.colliderMeshes) expect(mesh.visible).toBe(false)
        view.dispose()
        model.dispose()
    })
})
