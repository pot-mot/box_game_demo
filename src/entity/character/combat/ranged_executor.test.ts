import {beforeAll, describe, it, expect} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createHarnessWorld, initRapier, makeChar, makeStaticBox, stepWorld, DT, type HarnessWorld} from '../physics/harness.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {createRangedExecutor} from './ranged_executor.ts'
import {RANGED_WEAPON_PRESETS, type RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import {resolvePhases} from '../../../character/combat/attack_phases.ts'
import {defaultHoldMode, weaponAttacksOf} from '../../../character/weapon/catalog.ts'
import type {WeaponRuntime} from '../../../character/weapon/weapon_runtime.ts'
import type {ExecutorContext} from '../../../character/combat/executor.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {CollisionCategory} from '../../../physics/collision_category.ts'

/**
 * 投掷物穿透/阻挡行为测试：
 * 子弹命中「可穿过类别列表」之外的物体即消失（默认仅 area），命中列表内类别则继续飞行。
 * 判定由「上一帧位置 → 当前位置」的形状扫描完成，因此场景用例可覆盖高速子弹与薄碰撞体。
 */

type RangedExecutor = ReturnType<typeof createRangedExecutor>

const noopCtx: ExecutorContext = {fireProjectile: () => {}}

/** 测试武器：长弓 + 数值覆写（固定伤害 5 / 无击退 / 平射），便于断言 */
const makeWeaponRuntime = (weaponOverrides: Partial<RangedWeaponConfig> = {}, damage = 5): WeaponRuntime => {
    const weapon: RangedWeaponConfig = {
        ...RANGED_WEAPON_PRESETS.longbow,
        damage,
        knockbackForce: 0,
        ...weaponOverrides,
    }
    return {weapon, holdMode: defaultHoldMode(weapon), attacks: weaponAttacksOf(weapon)}
}

/** 在 +Z 方向开火：进入段的 release 阶段后首次 update 生成子弹（武器参数取自 combat.weapon）。
 * `muzzle` 可选：模拟 world 每帧从武器骨骼采样的真实枪口朝向（缺省不设 → 回退到起手方向 +Z）。 */
const fireForward = (
    executor: RangedExecutor,
    shooter: CharacterEntity,
    runtime: WeaponRuntime,
    muzzle?: {x: number; z: number},
): void => {
    shooter.combat.weapon = runtime.weapon
    shooter.combat.attacks = runtime.attacks
    shooter.combat.attackTimer = 0
    /* 开火门控 = release 阶段：测试直接把段阶段推进到 release */
    const segment = Object.values(runtime.attacks.segments)[0]
    shooter.combat.activeSegment = segment
    const releaseIndex = resolvePhases(segment.phases).findIndex(phase => phase.name === 'release')
    shooter.combat.phaseIndex = releaseIndex >= 0 ? releaseIndex : 0
    executor.start(shooter.combat, shooter, {x: 0, y: 0, z: 1}, noopCtx)
    if (muzzle) {
        shooter.combat.muzzleDirX = muzzle.x
        shooter.combat.muzzleDirZ = muzzle.z
    }
    executor.update(DT, shooter.combat, shooter, noopCtx)
}

/** 推进若干帧：物理步进 + 子弹结算（与 main.ts 的帧序一致） */
const runFrames = (hw: HarnessWorld, executor: RangedExecutor, chars: readonly CharacterEntity[], frames: number): void => {
    for (let i = 0; i < frames; i++) {
        stepWorld(hw)
        executor.updateBullets(DT, chars)
    }
}

/** 指定类别的静态碰撞块（模拟场景几何；水域等无物理体的实体用同法构造） */
const makeCategorizedBlock = (
    hw: HarnessWorld,
    category: CollisionCategory,
    x: number,
    y: number,
    z: number,
    halfX: number,
    halfY: number,
    halfZ: number,
): void => {
    const body = hw.shared.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
            .setFriction(0.5)
            .setDensity(0)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, category)),
        body,
    )
}

/** 射手在原点朝 +Z，目标在 z=8；射手刚体中心 y=0.5（胶囊底面贴地） */
const SHOOTER_Y = 0.5
const TARGET_Z = 8

describe('投掷物可穿过类别', () => {
    beforeAll(async () => {
        await initRapier()
    })

    it('弹道沿武器实时朝向（muzzleDir）发射，而非起手时记录的瞄准方向', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        /* 起手瞄准方向固定为 +Z，但武器实际朝 +X（角色未转身到位） */
        const frontTarget = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        const sideTarget = makeChar(hw, 3, TARGET_Z, SHOOTER_Y, 0)

        fireForward(executor, shooter, makeWeaponRuntime(), {x: 1, z: 0})
        runFrames(hw, executor, [shooter, frontTarget, sideTarget], 30)

        expect(sideTarget.combat.health).toBe(sideTarget.combat.maxHealth - 5)
        expect(frontTarget.combat.health).toBe(frontTarget.combat.maxHealth)
    })

    it('默认（仅 area）：命中箱子即消失，箱后目标不受伤害', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        makeStaticBox(hw, 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime())
        expect(executor.getBulletCount()).toBe(1)

        runFrames(hw, executor, [shooter, target], 30)

        expect(executor.getBulletCount()).toBe(0)
        expect(target.combat.health).toBe(target.combat.maxHealth)
    })

    it('可穿过列表加入 box：子弹穿过箱子并命中目标', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        makeStaticBox(hw, 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime({passThroughCategories: ['area', 'box']}))
        runFrames(hw, executor, [shooter, target], 30)

        expect(executor.getBulletCount()).toBe(0)
        expect(target.combat.health).toBe(target.combat.maxHealth - 5)
    })

    it('默认列表含 area：标注为 area 的碰撞体不阻挡子弹', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        /* 水域当前无物理体，用同类别标注的静态块验证默认列表确实放行 area */
        makeCategorizedBlock(hw, 'area', 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime())
        runFrames(hw, executor, [shooter, target], 30)

        expect(target.combat.health).toBe(target.combat.maxHealth - 5)
    })

    it('世界地面阻挡：无遮挡的平射子弹落地即消失（不会穿过地面）', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)

        /* 固定全额重力以便确定帧数：本用例只验证「地面阻挡」，与生产默认重力缩放解耦。
         * 约 24 帧落地；取 60 帧（< 未阻挡时坠出世界 y<-10 的约 89 帧），
         * 因此若地面扫描失效，子弹仍在飞、计数非 0，可被检出 */
        fireForward(executor, shooter, makeWeaponRuntime({projectileGravityScale: 1}))
        runFrames(hw, executor, [shooter], 60)

        expect(executor.getBulletCount()).toBe(0)
    })

    it('地形 / 碎片类别同样阻挡子弹', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        makeCategorizedBlock(hw, 'terrain', 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime({passThroughCategories: ['area', 'fragment']}))
        runFrames(hw, executor, [shooter], 10)

        expect(executor.getBulletCount()).toBe(0)
    })

    it('角色不在可穿过列表内：非敌对角色挡下子弹，后方敌人不被命中', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const ally = makeChar(hw, 2, 0, SHOOTER_Y, 2)
        const enemy = makeChar(hw, 3, 0, SHOOTER_Y, TARGET_Z)
        /* 射手只敌对异阵营：同阵营的 ally 挡下子弹（消失），但不结算伤害 */
        shooter.combat.attackTendency = (ownerFaction, targetFaction) => ownerFaction !== targetFaction
        enemy.combat.faction = 1

        fireForward(executor, shooter, makeWeaponRuntime())
        runFrames(hw, executor, [shooter, ally, enemy], 30)

        expect(executor.getBulletCount()).toBe(0)
        expect(ally.combat.health).toBe(ally.combat.maxHealth)
        expect(enemy.combat.health).toBe(enemy.combat.maxHealth)
    })

    it('可穿过列表加入 character：角色完全透明（穿过且不结算伤害）', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const enemy = makeChar(hw, 2, 0, SHOOTER_Y, 2)
        const enemy2 = makeChar(hw, 3, 0, SHOOTER_Y, TARGET_Z)
        shooter.combat.attackTendency = (ownerFaction, targetFaction) => ownerFaction !== targetFaction
        enemy.combat.faction = 1
        enemy2.combat.faction = 1

        fireForward(executor, shooter, makeWeaponRuntime({passThroughCategories: ['area', 'character']}))
        /* 默认配置下子弹会在 z=2 处被挡下；此处穿过两名敌人并继续飞行 */
        runFrames(hw, executor, [shooter, enemy, enemy2], 6)

        expect(executor.getBulletCount()).toBe(1)
        expect(enemy.combat.health).toBe(enemy.combat.maxHealth)
        expect(enemy2.combat.health).toBe(enemy2.combat.maxHealth)
    })

    it('翻滚无敌帧：弹丸穿过无敌目标并命中其后目标（不结算伤害/击退）', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const immune = makeChar(hw, 2, 0, SHOOTER_Y, 2)
        const target = makeChar(hw, 3, 0, SHOOTER_Y, TARGET_Z)
        immune.combat.invincibleTimer = 1

        fireForward(executor, shooter, makeWeaponRuntime())
        /* 无敌目标视为穿过：子弹不消耗、不伤害，继续飞行命中后方目标 */
        runFrames(hw, executor, [shooter, immune, target], 30)

        expect(immune.combat.health).toBe(immune.combat.maxHealth)
        expect(target.combat.health).toBe(target.combat.maxHealth - 5)
        expect(executor.getBulletCount()).toBe(0)
    })

    it('可穿过列表为空：命中场景几何即消失', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        makeStaticBox(hw, 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime({passThroughCategories: []}))
        runFrames(hw, executor, [shooter], 10)

        expect(executor.getBulletCount()).toBe(0)
    })

    it('爆炸子弹命中场景几何时就地引爆并伤害附近角色', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const bystander = makeChar(hw, 2, 0, SHOOTER_Y, 3.0)
        /* 箱面 z=1.75，爆炸半径 2 覆盖 z=3 的旁观者 */
        makeStaticBox(hw, 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime({explosionRadius: 2}))
        runFrames(hw, executor, [shooter, bystander], 10)

        expect(executor.getBulletCount()).toBe(0)
        expect(bystander.combat.health).toBeLessThan(bystander.combat.maxHealth)
    })

    it('魔法弹丸按目标魔法防御固定减伤（攻击类别取自武器 damageType）', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        target.combat.defense = {physical: 0, magic: 3}

        fireForward(executor, shooter, makeWeaponRuntime({damageType: 'magic'}, 5))
        runFrames(hw, executor, [shooter, target], 30)

        expect(target.combat.health).toBe(target.combat.maxHealth - 2)
    })

    it('物理弹丸不按目标魔法防御结算（按类别取对应防御）', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        target.combat.defense = {physical: 0, magic: 3}

        fireForward(executor, shooter, makeWeaponRuntime())
        runFrames(hw, executor, [shooter, target], 30)

        expect(target.combat.health).toBe(target.combat.maxHealth - 5)
    })

    it('装备攻击加成计入弹丸伤害：仅与武器类别匹配时生效', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, TARGET_Z)
        shooter.combat.attackBonus = {physical: 2, magic: 9}

        fireForward(executor, shooter, makeWeaponRuntime())
        runFrames(hw, executor, [shooter, target], 30)

        /* 长弓物理：(5 + 物理加成 2)；魔法加成 9 不参与 */
        expect(target.combat.health).toBe(target.combat.maxHealth - 7)
    })

    it('爆炸伤害继承武器攻击类别：魔法爆炸按目标魔法防御减免', () => {
        const hw = createHarnessWorld()
        const executor = createRangedExecutor(hw.shared, new Scene())
        const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
        const target = makeChar(hw, 2, 0, SHOOTER_Y, 3.0)
        target.combat.defense = {physical: 0, magic: 5}
        /* 箱面 z=1.75，目标 z=3.0：衰减伤害约 2，被 5 点魔防压到最小 1 */
        makeStaticBox(hw, 0, 0.5, 2, 0.5, 0.5, 0.25)

        fireForward(executor, shooter, makeWeaponRuntime({damageType: 'magic', explosionRadius: 2}))
        runFrames(hw, executor, [shooter, target], 10)

        expect(target.combat.health).toBe(target.combat.maxHealth - 1)
    })

    it('魔法爆炸伤害计入装备攻击加成（与武器类别匹配，物理加成不参与）', () => {
        /* 断言性质而非固定数值：同一场景分别注入不同加成，比较爆炸伤害。
         * 避免依赖爆炸衰减恰好跨过取整边界的脆弱硬编码值。 */
        const explosionDamage = (physicalBonus: number, magicBonus: number): number => {
            const hw = createHarnessWorld()
            const executor = createRangedExecutor(hw.shared, new Scene())
            const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
            const target = makeChar(hw, 2, 0, SHOOTER_Y, 3.0)
            shooter.combat.attackBonus = {physical: physicalBonus, magic: magicBonus}
            makeStaticBox(hw, 0, 0.5, 2, 0.5, 0.5, 0.25)

            fireForward(executor, shooter, makeWeaponRuntime({damageType: 'magic', explosionRadius: 3}))
            runFrames(hw, executor, [shooter, target], 10)

            return target.combat.maxHealth - target.combat.health
        }

        const noBonus = explosionDamage(0, 0)
        const magicBonus = explosionDamage(0, 1)
        const physicalBonus = explosionDamage(9, 0)

        expect(noBonus).toBeGreaterThan(0)
        /* 魔法加成计入：+1 点魔法攻击提高爆炸伤害 */
        expect(magicBonus).toBeGreaterThan(noBonus)
        /* 物理加成不参与魔法爆炸：仅物理加成与无加成结果一致 */
        expect(physicalBonus).toBe(noBonus)
    })

    it('蓄力缩放弹速：玩家按 charge 曲线，AI 忽略蓄力（用预设值）', () => {
        const speedOf = (isPlayer: boolean, charge: number): number => {
            const hw = createHarnessWorld()
            const executor = createRangedExecutor(hw.shared, new Scene())
            const shooter = makeChar(hw, 1, 0, SHOOTER_Y, 0)
            shooter.isPlayer = isPlayer
            shooter.combat.attackCharge = charge
            fireForward(executor, shooter, makeWeaponRuntime())
            let body: import('@dimforge/rapier3d-compat').RigidBody | undefined
            hw.shared.world.bodies.forEach((b) => {
                if (!b.isEnabled()) return
                for (let k = 0; k < b.numColliders(); k++) if (b.collider(k).isSensor()) body = b
            })
            const lv = body!.linvel()
            return Math.hypot(lv.x, lv.z)
        }
        const bow = RANGED_WEAPON_PRESETS.longbow
        expect(speedOf(true, 1)).toBeCloseTo(bow.projectileSpeed * bow.charge!.maxSpeedScale, 3)
        expect(speedOf(true, 0)).toBeCloseTo(bow.projectileSpeed * bow.charge!.minSpeedScale, 3)
        /* AI（非玩家）不套用蓄力曲线 */
        expect(speedOf(false, 1)).toBeCloseTo(bow.projectileSpeed, 3)
    })
})
