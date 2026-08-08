import {describe, it, expect} from 'vitest'
import {Vec3} from 'cannon-es'
import {isSupportedOn, shouldFall, projectToSlope, applySlopeAntiGravity} from './ground.ts'
import {SLOPE_WALK_THRESHOLD} from './constants.ts'
import {GRAVITY} from '../../physics/constants.ts'
import type {CharacterEntity} from '../types.ts'

/** 构造最小 CharacterEntity mock */
const makeEntity = (isOnGround: boolean, ny: number, nx = 0, nz = 0): CharacterEntity => ({
    id: 1,
    config: {speed: 6, jumpHeight: 2, radius: 0.125, height: 1},
    mesh: null!, wireframe: undefined, appearanceGroup: null!,
    body: {mass: 1, force: new Vec3(), velocity: new Vec3(), wakeUp: () => {}} as unknown as CharacterEntity['body'],
    isOnGround,
    groundNormal: {x: nx, y: ny, z: nz},
    groundKeepTimer: 0,
    airborneTime: 0, groundedTime: 0,
    rowText: '', isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
    isDying: false, dyingTimer: 0, dashCooldownTimer: 0,
    combat: null!, stateMachine: null!,
})

describe('isSupportedOn', () => {
    it('平坦支撑面（ny=1）为 true', () => {
        expect(isSupportedOn(makeEntity(true, 1), SLOPE_WALK_THRESHOLD)).toBe(true)
    })

    it('可站立斜坡（ny=0.6 > 0.5）为 true', () => {
        expect(isSupportedOn(makeEntity(true, 0.6, 0, 0.8), SLOPE_WALK_THRESHOLD)).toBe(true)
    })

    it('陡坡（ny=0.04 ≤ 0.06）为 false', () => {
        expect(isSupportedOn(makeEntity(true, 0.04, 0, 0.999), SLOPE_WALK_THRESHOLD)).toBe(false)
    })

    it('无支撑为 false', () => {
        expect(isSupportedOn(makeEntity(false, 1), SLOPE_WALK_THRESHOLD)).toBe(false)
    })
})

describe('shouldFall', () => {
    it('无支撑为 true', () => {
        expect(shouldFall(makeEntity(false, 1))).toBe(true)
    })

    it('陡坡（ny=0.04）为 true', () => {
        expect(shouldFall(makeEntity(true, 0.04, 0, 0.999))).toBe(true)
    })

    it('平地（ny=1）为 false', () => {
        expect(shouldFall(makeEntity(true, 1))).toBe(false)
    })
})

describe('projectToSlope', () => {
    it('满足 minNy 时写入投影速度且 v·n = 0', () => {
        const e = makeEntity(true, 0.6, 0, 0.8)
        const ok = projectToSlope(e, 3, 4, SLOPE_WALK_THRESHOLD)
        expect(ok).toBe(true)
        expect(e.body.velocity.x).toBe(3)
        expect(e.body.velocity.z).toBe(4)
        expect(e.body.velocity.y).toBeCloseTo(-(3 * 0 + 4 * 0.8) / 0.6, 10)
        const dot = 3 * 0 + e.body.velocity.y * 0.6 + 4 * 0.8
        expect(Math.abs(dot)).toBeLessThan(1e-9)
    })

    it('法线低于 minNy 时不投影且返回 false', () => {
        const e = makeEntity(true, 0.04, 0, 0.999)
        const ok = projectToSlope(e, 3, 4, SLOPE_WALK_THRESHOLD)
        expect(ok).toBe(false)
        expect(e.body.velocity.x).toBe(0)
        expect(e.body.velocity.z).toBe(0)
        expect(e.body.velocity.y).toBe(0)
    })

    it('无支撑时不投影且返回 false', () => {
        const e = makeEntity(false, 1)
        const ok = projectToSlope(e, 3, 4, SLOPE_WALK_THRESHOLD)
        expect(ok).toBe(false)
        expect(e.body.velocity.length()).toBe(0)
    })
})

describe('applySlopeAntiGravity', () => {
    it('可站立坡面施加反重力使合力为零', () => {
        const e = makeEntity(true, 0.6, 0, 0.8)
        applySlopeAntiGravity(e)
        expect(e.body.force.x).toBe(0)
        expect(e.body.force.z).toBe(0)
        /* force.y = -mass × GRAVITY，与重力 (0, GRAVITY, 0) 抵消 */
        expect(e.body.force.y).toBeCloseTo(-GRAVITY, 10)
    })

    it('陡坡（ny ≤ 0.06）不施加反重力', () => {
        const e = makeEntity(true, 0.04, 0, 0.999)
        applySlopeAntiGravity(e)
        expect(e.body.force.x).toBe(0)
        expect(e.body.force.y).toBe(0)
        expect(e.body.force.z).toBe(0)
    })

    it('无支撑不施加反重力', () => {
        const e = makeEntity(false, 1)
        applySlopeAntiGravity(e)
        expect(e.body.force.y).toBe(0)
    })
})
