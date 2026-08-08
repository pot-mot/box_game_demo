import {describe, it, expect} from 'vitest'
import {Body, BODY_TYPES, Box, Vec3, Heightfield, Quaternion, Plane} from 'cannon-es'
import {createSharedWorld} from '../../../physics/world.ts'
import {FIXED_TIME_STEP, TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK} from '../../../physics/constants.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {resolveGroundState, type GroundState} from './ground_state.ts'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'

const DT = FIXED_TIME_STEP
const FRAMES_3600 = 3600

/** 沿 X 上升的斜坡 Heightfield（data[xIdx][zIdx]），局部 X → 世界 X，局部 Y → 世界 -Z */
const makeSlope = (shared: ReturnType<typeof createSharedWorld>, slope: number): Body => {
    /* 840m 长：覆盖 walking 下坡 3600 帧（≈360m）移动范围 */
    const grid = 140
    const cell = 6
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

/** 移除 createSharedWorld 自带的默认地面 Plane（y=0），供垂直墙用例使用 */
const removeDefaultGround = (shared: ReturnType<typeof createSharedWorld>): void => {
    for (const b of [...shared.world.bodies]) {
        if (b.type === BODY_TYPES.STATIC && b.shapes.some(s => s instanceof Plane)) {
            shared.world.removeBody(b)
        }
    }
}

/** 倾斜 Plane 坡面（90° = 垂直墙，100° = 倒悬墙） */
const makeWall = (shared: ReturnType<typeof createSharedWorld>, thetaDeg: number): Body => {
    const body = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        material: shared.boxMat,
        collisionFilterGroup: TERRAIN_COLLISION_GROUP,
        collisionFilterMask: TERRAIN_COLLISION_MASK,
    })
    body.addShape(new Plane())
    body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2 + thetaDeg * Math.PI / 180)
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
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
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

/** 统计 3600 帧的状态分布与 falling 帧数 */
const runAndStats = (
    shared: ReturnType<typeof createSharedWorld>,
    entity: CharacterEntity,
    dx: number,
    frames: number,
): {fallingFrames: number; finalState: string; states: Set<string>} => {
    let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
    let fallingFrames = 0
    const states = new Set<string>()
    for (let i = 0; i < frames; i++) {
        gs = tick(shared, entity, gs, dx, 0)
        states.add(entity.stateMachine.currentState)
        if (entity.stateMachine.currentState === 'falling') fallingFrames++
    }
    return {fallingFrames, finalState: entity.stateMachine.currentState, states}
}

const SLOPES_WALKABLE = [10, 20, 30, 40, 50, 60, 70, 80, 85] as const
const SLOPES_FALLING = [90, 100] as const

describe('walking 下坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程处于 walking（falling 帧数 = 0）`, () => {
            const shared = createSharedWorld()
            makeSlope(shared, Math.tan(deg * Math.PI / 180))
            const x = 820
            /* 贴地 spawn：底棱紧贴坡面，排除初始下落 */
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(shared, x, y, -50)
            const r = runAndStats(shared, entity, -1, FRAMES_3600)
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('walking')
        })
    }
    for (const deg of SLOPES_FALLING) {
        it(`${deg}° 必须全程处于 falling`, () => {
            const shared = createSharedWorld()
            removeDefaultGround(shared)
            makeWall(shared, deg)
            /* 贴墙 spawn：90° 墙在 z=0（角色 z=0.1 贴墙），100° 墙法线朝下偏（正侧 z=0.5） */
            const entity = makeChar(shared, 0, deg === 90 ? 3 : 1, deg === 90 ? 0.1 : 0.5)
            const r = runAndStats(shared, entity, -1, FRAMES_3600)
            expect(r.fallingFrames).toBeGreaterThan(FRAMES_3600 * 0.9)
            expect(r.finalState).toBe('falling')
        })
    }
})

describe('idle 下坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程处于 idle（falling 帧数 = 0）`, () => {
            const shared = createSharedWorld()
            makeSlope(shared, Math.tan(deg * Math.PI / 180))
            const x = 820
            /* 贴地 spawn：底棱紧贴坡面，排除初始下落 */
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(shared, x, y, -50)
            const r = runAndStats(shared, entity, 0, FRAMES_3600)
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('idle')
        })
    }
    for (const deg of SLOPES_FALLING) {
        it(`${deg}° 必须全程处于 falling`, () => {
            const shared = createSharedWorld()
            removeDefaultGround(shared)
            makeWall(shared, deg)
            /* 贴墙 spawn：90° 墙在 z=0（角色 z=0.1 贴墙），100° 墙法线朝下偏（正侧 z=0.5） */
            const entity = makeChar(shared, 0, deg === 90 ? 3 : 1, deg === 90 ? 0.1 : 0.5)
            const r = runAndStats(shared, entity, 0, FRAMES_3600)
            expect(r.fallingFrames).toBeGreaterThan(FRAMES_3600 * 0.9)
            expect(r.finalState).toBe('falling')
        })
    }
})
