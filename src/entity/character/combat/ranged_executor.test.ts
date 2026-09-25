import {beforeAll, describe, it, expect} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createHarnessWorld, initRapier, makeChar, makeStaticBox, stepWorld, DT, type HarnessWorld} from '../physics/harness.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {createRangedExecutor} from './ranged_executor.ts'
import {RANGED_WEAPON_PRESETS, type RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
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
    return {weapon, attacks: weapon.attacks}
}

/** 在 +Z 方向开火（执行器只在首次 update 时生成子弹；武器参数取自 combat.weapon） */
const fireForward = (executor: RangedExecutor, shooter: CharacterEntity, runtime: WeaponRuntime): void => {
    shooter.combat.weapon = runtime.weapon
    shooter.combat.attacks = runtime.attacks
    shooter.combat.attackTimer = 0
    executor.start(shooter.combat, shooter, {x: 0, y: 0, z: 1}, noopCtx)
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

        fireForward(executor, shooter, makeWeaponRuntime())
        /* 初速 y=0，仅受重力：约 0.4s 落地；未修复时子弹会穿过地面直到 y<-10（约 1.5s） */
        runFrames(hw, executor, [shooter], 40)

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
})
