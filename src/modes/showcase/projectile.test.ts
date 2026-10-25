import {describe, it, expect} from 'vitest'
import {Scene} from 'three'
import {createShowcaseProjectiles} from './projectile.ts'
import {findWeaponLike} from '../../character/weapon/catalog.ts'
import type {RangedWeaponConfig} from '../../character/weapon/ranged_weapon.ts'

const rangedOf = (id: string): RangedWeaponConfig => {
    const weapon = findWeaponLike(id)
    if (weapon === undefined || weapon.type !== 'ranged') throw new Error(`${id} 不是远程武器`)
    return weapon
}

describe('展示模式弹丸（只播视觉 / 弹道，不结算伤害）', () => {
    it('远程武器可生成并随时间消失', () => {
        const projectiles = createShowcaseProjectiles(new Scene())
        projectiles.spawn(rangedOf('longbow'), {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}, 0)
        expect(projectiles.count()).toBe(1)
        projectiles.update(0.1)
        expect(projectiles.count()).toBe(1)
        projectiles.update(5)
        expect(projectiles.count()).toBe(0)
        projectiles.dispose()
    })

    it('吐息弹丸同样可生成（含火球 / 雷电 / 激光）', () => {
        const projectiles = createShowcaseProjectiles(new Scene())
        for (const id of ['breath_natural', 'breath_fireball', 'breath_lightning', 'breath_laser']) {
            projectiles.spawn(rangedOf(id), {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}, 0)
        }
        expect(projectiles.count()).toBe(4)
        projectiles.clear()
        expect(projectiles.count()).toBe(0)
        projectiles.dispose()
    })
})
