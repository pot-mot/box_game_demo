import {describe, it, expect} from 'vitest'
import {Body, BODY_TYPES, Box, Vec3, Heightfield, Quaternion} from 'cannon-es'
import {createSharedWorld} from '../../../physics/world.ts'
import {FIXED_TIME_STEP, TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK} from '../../../physics/constants.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {resolveGroundState, type GroundState} from './ground_state.ts'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'

const DT = FIXED_TIME_STEP
const FRAMES_2S = 120

/** 沿 X 上升的斜坡 Heightfield（data[xIdx][zIdx]），局部 X → 世界 X，局部 Y → 世界 -Z */
const makeSlope = (shared: ReturnType<typeof createSharedWorld>, slope: number): Body => {
    const grid = 32
    const cell = 2
    const heights = Array.from({length: grid}, (_, xi) =>
        Array.from({length: grid}, (_, _zi) => slope * xi * cell))
    const body = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        material: shared.boxMat,
        collisionFilterGroup: TERRAIN_COLLISION_GROUP,
        collisionFilterMask: TERRAIN_COLLISION_MASK,
    })
    body.addShape(new Heightfield(heights, {elementSize: cell}))
    body.quaternion.copy(new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2))
    shared.world.addBody(body)
    return body
}

/** 构造角色（Box 碰撞体 + charMat 摩擦 0 + 真实状态机） */
const makeChar = (shared: ReturnType<typeof createSharedWorld>, x: number, y: number, z: number): CharacterEntity => {
    const body = new Body({
        mass: 1,
        type: BODY_TYPES.DYNAMIC,
        linearDamping: 0.2,
        fixedRotation: true,
        material: shared.charMat,
        collisionFilterGroup: CHARACTER_COLLISION_GROUP,
        collisionFilterMask: CHARACTER_COLLISION_MASK,
    })
    body.addShape(new Box(new Vec3(0.125, 0.5, 0.125)))
    body.position.set(x, y, z)
    shared.world.addBody(body)

    const slot = createSkillSlot(MELEE_SKILL_PRESETS.long_sword_slash)
    const entity: CharacterEntity = {
        id: 1,
        config: {speed: 6, jumpHeight: 2, radius: 0.125, height: 1},
        mesh: null!, wireframe: undefined, appearanceGroup: null!,
        body,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        rowText: '', isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
        isDying: false, dyingTimer: 0, dashCooldownTimer: 0,
        combat: {
            faction: 0, health: 100, maxHealth: 100, isDead: false,
            damageModifiers: [],
            attackTendency: () => true,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            onDamageTaken: null, onDeath: null, onDamageDealt: null,
            skills: [slot], currentSkillIndex: 0,
            attackActive: false, attackTimer: 0,
            attackedTargets: new Set(), attackDirX: 0, attackDirZ: 0, swingTilt: 0,
        } as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    }
    return entity
}

/** 单帧模拟（与游戏循环同序：step → 地面检测 → 状态机） */
const tick = (
    shared: ReturnType<typeof createSharedWorld>,
    entity: CharacterEntity,
    gs: GroundState,
    dx: number,
    dz: number,
): GroundState => {
    shared.world.step(DT, DT, 1)
    const next = resolveGroundState(shared.world.contacts, entity.body, gs, DT)
    entity.isOnGround = next.isOnGround
    entity.groundNormal = next.groundNormal
    entity.groundKeepTimer = next.groundKeepTimer
    entity.stateMachine.setInput(dx, dz, false, false)
    entity.stateMachine.update(DT, entity)
    return next
}

describe('斜坡静止（防滑）', () => {
    it('30° 坡 idle 静止 2s 不下滑', () => {
        const shared = createSharedWorld()
        makeSlope(shared, Math.tan(Math.PI / 6))
        const x = 20
        const z = -20
        const y = Math.tan(Math.PI / 6) * x + 1
        const entity = makeChar(shared, x, y, z)

        let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
        /* 预热 1s：角色落稳坡面（落地冲击位移不计入防滑判定） */
        for (let i = 0; i < 60; i++) gs = tick(shared, entity, gs, 0, 0)
        const x0 = entity.body.position.x
        const z0 = entity.body.position.z
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(shared, entity, gs, 0, 0)

        expect(Math.abs(entity.body.position.x - x0)).toBeLessThan(0.05)
        expect(Math.abs(entity.body.position.z - z0)).toBeLessThan(0.05)
        expect(entity.stateMachine.currentState).toBe('idle')
    })

    it('45° 坡 idle 静止 2s 不下滑', () => {
        const shared = createSharedWorld()
        makeSlope(shared, Math.tan(Math.PI / 4))
        const x = 20
        const z = -20
        const y = Math.tan(Math.PI / 4) * x + 1
        const entity = makeChar(shared, x, y, z)

        let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
        /* 预热 1s：角色落稳坡面（落地冲击位移不计入防滑判定） */
        for (let i = 0; i < 60; i++) gs = tick(shared, entity, gs, 0, 0)
        const x0 = entity.body.position.x
        const z0 = entity.body.position.z
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(shared, entity, gs, 0, 0)

        expect(Math.abs(entity.body.position.x - x0)).toBeLessThan(0.05)
        expect(Math.abs(entity.body.position.z - z0)).toBeLessThan(0.05)
        expect(entity.stateMachine.currentState).toBe('idle')
    })
})

describe('斜坡下坡行走', () => {
    it('30° 坡下坡行走 2s 无状态抖动且速度有界', () => {
        const shared = createSharedWorld()
        makeSlope(shared, Math.tan(Math.PI / 6))
        const x = 20
        const z = -20
        const y = Math.tan(Math.PI / 6) * x + 1
        const entity = makeChar(shared, x, y, z)

        let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
        /* 预热 0.5s：让角色落稳坡面（不计切换） */
        for (let i = 0; i < 30; i++) gs = tick(shared, entity, gs, -1, 0)
        let prev = entity.stateMachine.currentState
        let flips = 0
        for (let i = 0; i < FRAMES_2S; i++) {
            gs = tick(shared, entity, gs, -1, 0)
            if (entity.stateMachine.currentState !== prev) {
                flips++
                prev = entity.stateMachine.currentState
            }
        }

        expect(flips).toBeLessThanOrEqual(2)
        expect(entity.body.velocity.length()).toBeLessThanOrEqual(12.1)
        expect(entity.body.position.x).toBeLessThan(x)
    })
})

describe('陡坡下滑（预期行为）', () => {
    it('62° 坡 idle 2s 进入 falling 且速度有界、位置下降', () => {
        const shared = createSharedWorld()
        makeSlope(shared, Math.tan(Math.PI * 62 / 180))
        const x = 10
        const z = -20
        const y = Math.tan(Math.PI * 62 / 180) * x + 1
        const entity = makeChar(shared, x, y, z)

        let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(shared, entity, gs, 0, 0)

        expect(entity.stateMachine.currentState).toBe('falling')
        expect(entity.body.velocity.length()).toBeLessThanOrEqual(12.1)
        expect(entity.body.position.y).toBeLessThan(y - 0.5)
    })
})

describe('平地回归', () => {
    it('平地行走 2s 速度接近配置速度（摩擦回归保护）', () => {
        const shared = createSharedWorld()
        const entity = makeChar(shared, 0, 0.5, 0)

        let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(shared, entity, gs, 1, 0)

        expect(entity.body.position.x).toBeGreaterThan(11)
    })
})
