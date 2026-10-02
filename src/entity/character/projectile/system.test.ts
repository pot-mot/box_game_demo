import {beforeAll, describe, it, expect} from 'vitest'
import {Scene} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {createHarnessWorld, initRapier, makeChar, makeStaticBox, stepWorld, DT} from '../physics/harness.ts'
import {RANGED_WEAPON_PRESETS, type RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import {createProjectileSystem} from './system.ts'

/**
 * 弹丸系统：对象池复用 / 重力缩放 / 生成与回收。
 * 弹丸物理行为（可穿过类别 / 命中 / 爆炸伤害）由 `ranged_executor.test.ts` 端到端覆盖。
 */

/** 世界中「在飞」sensor 刚体（池化空闲刚体被禁用，不计入） */
const enabledSensorBodies = (shared: SharedWorld): RAPIER.RigidBody[] => {
    const bodies: RAPIER.RigidBody[] = []
    shared.world.bodies.forEach((body) => {
        if (!body.isEnabled()) return
        for (let i = 0; i < body.numColliders(); i++) {
            if (body.collider(i).isSensor()) bodies.push(body)
        }
    })
    return bodies
}

const weaponWith = (gravityScale: number): RangedWeaponConfig => ({
    ...RANGED_WEAPON_PRESETS.longbow,
    projectileGravityScale: gravityScale,
})

/** 平射一发、推进 0.5s，返回弹丸下落量（m） */
const dropAfterHalfSecond = (gravityScale: number): number => {
    const hw = createHarnessWorld()
    const system = createProjectileSystem(hw.shared, new Scene())
    const owner = makeChar(hw, 1, 0, 5, 0)
    system.spawn({owner, direction: {x: 0, y: 0, z: 1}, weapon: weaponWith(gravityScale), throwAngle: 0})
    const body = enabledSensorBodies(hw.shared)[0]
    const y0 = body.translation().y
    for (let i = 0; i < 30; i++) {
        stepWorld(hw)
        system.update(DT, [owner])
    }
    return y0 - body.translation().y
}

describe('弹丸系统', () => {
    beforeAll(async () => {
        await initRapier()
    })

    it('生成一发弹丸（启用 sensor 刚体 + 场景视觉），平射沿方向飞行', () => {
        const hw = createHarnessWorld()
        const scene = new Scene()
        const system = createProjectileSystem(hw.shared, scene)
        const owner = makeChar(hw, 1, 0, 5, 0)

        system.spawn({owner, direction: {x: 0, y: 0, z: 1}, weapon: weaponWith(0), throwAngle: 0})
        expect(system.count()).toBe(1)
        expect(enabledSensorBodies(hw.shared)).toHaveLength(1)

        const body = enabledSensorBodies(hw.shared)[0]
        const z0 = body.translation().z
        for (let i = 0; i < 10; i++) {
            stepWorld(hw)
            system.update(DT, [owner])
        }
        expect(body.translation().z).toBeGreaterThan(z0)
    })

    it('降低重力：默认重力缩放的下落量远小于全额重力', () => {
        /* 全额重力 0.5s 下落 ≈ 0.5 × 9.82 × 0.25 ≈ 1.23m */
        const full = dropAfterHalfSecond(1)
        const reduced = dropAfterHalfSecond(0.08)
        const zero = dropAfterHalfSecond(0)

        expect(full).toBeGreaterThan(1)
        expect(reduced).toBeLessThan(full * 0.2)
        expect(zero).toBeLessThan(0.02)
    })

    it('对象池复用：清除后再次发射复用同一刚体', () => {
        const hw = createHarnessWorld()
        const scene = new Scene()
        const system = createProjectileSystem(hw.shared, scene)
        const owner = makeChar(hw, 1, 0, 5, 0)

        system.spawn({owner, direction: {x: 0, y: 0, z: 1}, weapon: weaponWith(0), throwAngle: 0})
        const firstHandle = enabledSensorBodies(hw.shared)[0].handle

        system.clear()
        expect(system.count()).toBe(0)
        expect(enabledSensorBodies(hw.shared)).toHaveLength(0)

        system.spawn({owner, direction: {x: 0, y: 0, z: 1}, weapon: weaponWith(0), throwAngle: 0})
        const secondHandle = enabledSensorBodies(hw.shared)[0].handle

        expect(secondHandle).toBe(firstHandle)
    })

    it('clear 回收全部在飞弹丸与特效，场景与物理世界不留残留', () => {
        const hw = createHarnessWorld()
        const scene = new Scene()
        const system = createProjectileSystem(hw.shared, scene)
        const owner = makeChar(hw, 1, 0, 5, 0)
        makeStaticBox(hw, 0, 5, 1, 0.5, 0.5, 0.25)

        /* 法杖魔法球：命中箱子时生成爆炸特效 */
        system.spawn({
            owner, direction: {x: 0, y: 0, z: 1},
            weapon: RANGED_WEAPON_PRESETS.staff, throwAngle: 0,
        })
        for (let i = 0; i < 20; i++) {
            stepWorld(hw)
            system.update(DT, [owner])
        }

        /* 魔法球命中箱子后引爆并生成爆炸特效 */
        expect(system.effectCount()).toBeGreaterThan(0)

        system.clear()
        expect(system.count()).toBe(0)
        expect(system.effectCount()).toBe(0)
        expect(enabledSensorBodies(hw.shared)).toHaveLength(0)
        expect(scene.children).toHaveLength(0)
    })

    it('蓄力缩放初速与伤害：满蓄力 = max 倍率，缺省（AI）不缩放', () => {
        const bow = RANGED_WEAPON_PRESETS.longbow
        const curve = bow.charge!
        const speedOf = (charge?: number): number => {
            const hw = createHarnessWorld()
            const system = createProjectileSystem(hw.shared, new Scene())
            const owner = makeChar(hw, 1, 0, 5, 0)
            system.spawn({
                owner, direction: {x: 0, y: 0, z: 1}, weapon: bow, throwAngle: 0,
                ...(charge !== undefined ? {charge} : {}),
            })
            const lv = enabledSensorBodies(hw.shared)[0].linvel()
            return Math.hypot(lv.x, lv.z)
        }
        const damageOf = (charge?: number): number => {
            const hw = createHarnessWorld()
            const system = createProjectileSystem(hw.shared, new Scene())
            const owner = makeChar(hw, 1, 0, 0.5, 0)
            const target = makeChar(hw, 2, 0, 0.5, 6)
            system.spawn({
                owner, direction: {x: 0, y: 0, z: 1}, weapon: bow, throwAngle: 0,
                ...(charge !== undefined ? {charge} : {}),
            })
            for (let i = 0; i < 80; i++) {
                stepWorld(hw)
                system.update(DT, [owner, target])
            }
            return target.combat.maxHealth - target.combat.health
        }

        expect(speedOf(1)).toBeCloseTo(bow.projectileSpeed * curve.maxSpeedScale, 3)
        expect(speedOf(0)).toBeCloseTo(bow.projectileSpeed * curve.minSpeedScale, 3)
        expect(speedOf(undefined)).toBeCloseTo(bow.projectileSpeed, 3)

        expect(damageOf(undefined)).toBeCloseTo(bow.damage, 4)
        expect(damageOf(1)).toBeCloseTo(bow.damage * (curve.maxChargeMultiplier / 100), 4)
        /* 统一蓄力模型：0 蓄力 = 100% 伤害 */
        expect(damageOf(0)).toBeCloseTo(bow.damage, 4)
    })
})
