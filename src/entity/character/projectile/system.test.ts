import {beforeAll, describe, it, expect} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {createHarnessWorld, initRapier, makeChar, makeStaticBox, stepWorld, DT} from '../physics/harness.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {allWeaponPresets} from '../../../character/weapon/catalog.ts'
import type {RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'

const RANGED_WEAPON_PRESETS: Record<string, RangedWeaponConfig> = Object.fromEntries(
    allWeaponPresets().filter((w): w is RangedWeaponConfig => w.type === 'ranged').map(w => [w.id, w]),
)
import {SHIELD_BLOCK_MEDIUM} from '../../../character/weapon/constants.ts'
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

    it('指定发射点时从挂点（口部 / 枪口）生成，而不是身体中心', () => {
        const hw = createHarnessWorld()
        const system = createProjectileSystem(hw.shared, new Scene())
        const owner = makeChar(hw, 1, 0, 5, 0)

        system.spawn({
            owner,
            origin: {x: 3, y: 4, z: 5},
            direction: {x: 0, y: 0, z: 1},
            weapon: weaponWith(0),
            throwAngle: 0,
        })
        const body = enabledSensorBodies(hw.shared)[0]
        const p = body.translation()
        expect(p.x).toBeCloseTo(3, 6)
        expect(p.y).toBeCloseTo(4, 6)
        expect(p.z).toBeCloseTo(5, 6)
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

    /** 场景：owner(0) 平射举盾 target(6)，返回目标与武器（`yaw` 决定盾在身前还是身后） */
    const fireAtBlockingTarget = (yaw: number) => {
        const hw = createHarnessWorld()
        const scene = new Scene()
        const shieldOwners = new Map<number, number>()
        const system = createProjectileSystem(hw.shared, scene, undefined, (h) => shieldOwners.get(h))
        const owner = makeChar(hw, 1, 0, 0.5, 0)
        const target = makeChar(hw, 2, 0, 0.5, 6)
        const block = SHIELD_BLOCK_MEDIUM
        target.combat.block = block
        target.combat.blocking = true
        target.combat.guard = block.guardMax
        const cover = block.cover
        const desc = RAPIER.ColliderDesc.cuboid(cover.width / 2, cover.height / 2, cover.depth / 2)
            .setSensor(true)
            .setCollisionGroups(categoryCollisionGroups(0, 0, 'shield'))
        const collider = hw.shared.world.createCollider(desc)
        shieldOwners.set(collider.handle, 2)

        const bow = RANGED_WEAPON_PRESETS.longbow
        /* harness 胶囊总高 1.0 → body 中心比脚底高 0.5；`cover` 偏移相对脚底。
         * 位置须在 stepWorld 前写好，查询管线才在下一步生效（与 world.ts 的每帧同步一致）。 */
        const scale = target.config.scale
        const tp0 = target.body.translation()
        collider.setTranslation({
            x: tp0.x + Math.sin(yaw) * cover.offsetZ * scale,
            y: tp0.y - 0.5 + cover.offsetY * scale,
            z: tp0.z + Math.cos(yaw) * cover.offsetZ * scale,
        })
        collider.setRotation({x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2)})

        system.spawn({owner, direction: {x: 0, y: 0, z: 1}, weapon: bow, throwAngle: 0})
        for (let i = 0; i < 80; i++) {
            stepWorld(hw)
            system.update(DT, [owner, target])
        }
        return {target, bow, block}
    }

    it('盾格挡：正面来弹先命中盾遮挡体，按格挡系数减免伤害 / 扣格挡槽并消耗子弹', () => {
        /* 目标面朝 -Z（正对 owner）：盾位于身体前方 */
        const {target, bow, block} = fireAtBlockingTarget(Math.PI)
        const blockedDamage = bow.damage * block.blockDamageMultiplier
        expect(target.combat.guard).toBeCloseTo(block.guardMax - blockedDamage, 4)
        expect(target.combat.maxHealth - target.combat.health).toBeCloseTo(blockedDamage, 4)
    })

    it('盾格挡：盾在背后时弹道未触及遮挡体，按正常伤害结算且格挡槽不消耗', () => {
        /* 目标面朝 +Z（背对 owner）：盾在身体后方，弹道在角色中心终止 */
        const {target, bow, block} = fireAtBlockingTarget(0)
        expect(target.combat.guard).toBe(block.guardMax)
        expect(target.combat.maxHealth - target.combat.health).toBeCloseTo(bow.damage, 4)
    })
})
