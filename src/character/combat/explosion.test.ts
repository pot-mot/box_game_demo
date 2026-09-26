import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {applyExplosionDamage} from './explosion.ts'
import {createCombatComponent} from './types.ts'
import {createWeaponRuntime} from '../weapon/weapon_runtime.ts'

/** 构造最低限度 CharacterEntity mock */
const makeMock = (id: number, x: number, y: number, z: number, hp: number, faction: number, isDead: boolean): Parameters<typeof applyExplosionDamage>[6] => {
    /* 战斗组件走生产工厂（武器运行时 + 阵营 + 倾向）；本用例只消费 health / 阵营判定 */
    const combat = createCombatComponent(
        createWeaponRuntime('long_sword'),
        faction,
        (a: number, b: number) => a !== b,
        {tendencyId: 'hostileExceptSelf'},
        hp,
    )
    combat.isDead = isDead

    return {
        id,
        config: {speed: 0, jumpHeight: 0, scale: 1},
        mesh: null!, wireframe: undefined, appearanceGroup: null!,
        body: {
            translation: () => ({x, y, z}),
            linvel: () => ({x: 0, y: 0, z: 0}),
            applyImpulseAtPoint: () => {},
            wakeUp: () => {},
            handle: id,
        } as unknown as Parameters<typeof applyExplosionDamage>[6]['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        isOnGround: true, groundNormal: { x: 0, y: 1, z: 0 }, groundKeepTimer: 0, airborneTime: 0, groundedTime: 0,
        rowText: '', navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical', isDying: false, dyingTimer: 0, dyingFallDirX: 0, dyingFallDirZ: 0, dyingFallAngle: 0,
        combat,
        holdMode: 'one_handed',
        stateMachine: null!,
    }
}

describe('applyExplosionDamage', () => {
    it('中心点目标承受满伤害', () => {
        const src = makeMock(1, 0, 0, 0, 100, 0, false)
        const target = makeMock(2, 0.1, 0, 0, 50, 1, false)
        applyExplosionDamage(0, 0, 0, 2, 10, 5, src, [target])
        expect(target.combat.health).toBeLessThan(50)
        expect(target.combat.health).toBeGreaterThan(35) // 满伤 10，50-10=40 附近
    })

    it('半径边缘目标承受衰减伤害', () => {
        const src = makeMock(1, 0, 0, 0, 100, 0, false)
        const target = makeMock(2, 1.8, 0, 0, 50, 1, false)
        applyExplosionDamage(0, 0, 0, 2, 10, 5, src, [target])
        // dist=1.8, falloff=1-1.8/2=0.1, dmg=ceil(10*0.1)=1
        expect(target.combat.health).toBe(49)
    })

    it('范围外目标不受伤害', () => {
        const src = makeMock(1, 0, 0, 0, 100, 0, false)
        const target = makeMock(2, 3, 0, 0, 50, 1, false)
        applyExplosionDamage(0, 0, 0, 2, 10, 5, src, [target])
        expect(target.combat.health).toBe(50)
    })

    it('友军不受伤害', () => {
        const src = makeMock(1, 0, 0, 0, 100, 1, false)
        const target = makeMock(2, 0, 0, 0, 50, 1, false)
        applyExplosionDamage(0, 0, 0, 2, 10, 5, src, [target])
        expect(target.combat.health).toBe(50)
    })

    it('已死亡目标不受伤害', () => {
        const src = makeMock(1, 0, 0, 0, 100, 0, false)
        const target = makeMock(2, 0, 0, 0, 50, 1, true)
        applyExplosionDamage(0, 0, 0, 2, 10, 5, src, [target])
        expect(target.combat.health).toBe(50)
    })

    it('多个目标全部受影响', () => {
        const src = makeMock(1, 0, 0, 0, 100, 0, false)
        const t1 = makeMock(2, 0.5, 0, 0, 50, 1, false)
        const t2 = makeMock(3, -0.3, 0, 0.2, 50, 2, false)
        applyExplosionDamage(0, 0, 0, 3, 10, 5, src, [t1, t2])
        expect(t1.combat.health).toBeLessThan(50)
        expect(t2.combat.health).toBeLessThan(50)
    })

    it('最小伤害不小于 1', () => {
        const src = makeMock(1, 0, 0, 0, 100, 0, false)
        // dist=1.99, falloff=1-1.99/2=0.005, dmg=ceil(10*0.005)=1
        const target = makeMock(2, 1.99, 0, 0, 50, 1, false)
        applyExplosionDamage(0, 0, 0, 2, 10, 5, src, [target])
        expect(target.combat.health).toBe(49) // 50 - 1 = 49
    })
})
