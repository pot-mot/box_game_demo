/**
 * 测试文件需要重写为 Rapier API。
 * 原测试使用 cannon-es Body / Vec3 构造接触信息与地面状态；
 * resolveGroundState 签名已从 (contacts, Body, prev, dt) 变为 (contacts, bodyHandle, prev, dt)。
 * 此文件已做最小适配使其可通过类型检查，但测试逻辑尚未完整迁移。
 */
import {describe, it, expect} from 'vitest'
import {resolveGroundState, DEFAULT_GROUND_NORMAL, type GroundState, type GroundContactLike} from './ground_state.ts'
import {GROUND_KEEP_TIME} from '../../../character/state_machine/constants.ts'

const BODY_A_HANDLE = 1
const BODY_B_HANDLE = 2
const BODY_C_HANDLE = 3

const contact = (bi: number, bj: number, ni: {x: number; y: number; z: number} | null): GroundContactLike => {
    const n = ni ?? {x: 0, y: 0, z: 0}
    return {normal: n, bodyAHandle: bi, bodyBHandle: bj}
}

/** 角色在 bodyA 上、地面在 bodyB：接触法线 ni 约定为从 bi 指向 bj（= 地面法线的相反方向） */
const groundedContact = (ny: number, nx = 0, nz = 0): GroundContactLike =>
    contact(BODY_A_HANDLE, BODY_B_HANDLE, {x: -nx, y: -ny, z: -nz})

const prevState = (partial: Partial<GroundState>): GroundState => ({
    isOnGround: true,
    groundNormal: {x: 0, y: 1, z: 0},
    groundKeepTimer: 0,
    ...partial,
})

describe('resolveGroundState', () => {
    it('有朝上接触：判定着地、刷新法线、重置郊狼计时', () => {
        const next = resolveGroundState([groundedContact(1)], BODY_A_HANDLE, prevState({groundKeepTimer: 0}), 1 / 60)
        expect(next.isOnGround).toBe(true)
        expect(next.groundNormal).toEqual({x: 0, y: 1, z: 0})
        expect(next.groundKeepTimer).toBe(GROUND_KEEP_TIME)
    })

    it('多数法线方向簇胜出（抑制孤立异常法线）', () => {
        const contacts = [
            groundedContact(0.8, 0, 0.6),
            groundedContact(0.8, 0, 0.6),
            groundedContact(1),
        ]
        const next = resolveGroundState(contacts, BODY_A_HANDLE, prevState({groundKeepTimer: 0}), 1 / 60)
        expect(next.groundNormal.x).toBeCloseTo(0, 10)
        expect(next.groundNormal.y).toBeCloseTo(0.8, 5)
        expect(next.groundNormal.z).toBeCloseTo(0.6, 5)
    })

    it('朝下法线的接触（翻转后 ny ≤ 0）不算着地', () => {
        const contacts = [contact(BODY_A_HANDLE, BODY_B_HANDLE, {x: 0, y: 1, z: 0})]
        const next = resolveGroundState(contacts, BODY_A_HANDLE, prevState({groundKeepTimer: 0}), 1 / 60)
        expect(next.isOnGround).toBe(false)
    })

    it('ni 为 null 的接触跳过', () => {
        const next = resolveGroundState([contact(BODY_A_HANDLE, BODY_B_HANDLE, null)], BODY_A_HANDLE, prevState({groundKeepTimer: 0}), 1 / 60)
        expect(next.isOnGround).toBe(false)
    })

    it('无关接触（不含本 body）跳过', () => {
        const contacts = [contact(BODY_B_HANDLE, BODY_C_HANDLE, {x: 0, y: -1, z: 0})]
        const next = resolveGroundState(contacts, BODY_A_HANDLE, prevState({groundKeepTimer: 0}), 1 / 60)
        expect(next.isOnGround).toBe(false)
    })

    it('宽限期内脱离：保持 isOnGround 与上一帧法线，计时递减', () => {
        const prev = prevState({
            groundNormal: {x: 0, y: 0.6, z: 0.8},
            groundKeepTimer: 0.05,
        })
        const next = resolveGroundState([], BODY_A_HANDLE, prev, 1 / 60)
        expect(next.isOnGround).toBe(true)
        expect(next.groundNormal).toEqual({x: 0, y: 0.6, z: 0.8})
        expect(next.groundKeepTimer).toBeCloseTo(0.05 - 1 / 60, 10)
    })

    it('持续脱离超过宽限期：真正判定为脱离地面', () => {
        const prev = prevState({groundKeepTimer: 1 / 60})
        const next = resolveGroundState([], BODY_A_HANDLE, prev, 0.1)
        expect(next.isOnGround).toBe(false)
        expect(next.groundNormal).toEqual(DEFAULT_GROUND_NORMAL)
        expect(next.groundKeepTimer).toBe(0)
    })

    it('已有真实接触时刷新法线而非保留旧值', () => {
        const prev = prevState({groundNormal: {x: 0, y: 1, z: 0}})
        const next = resolveGroundState([groundedContact(0.6, 0, 0.8)], BODY_A_HANDLE, prev, 1 / 60)
        expect(next.groundNormal).toEqual({x: 0, y: 0.6, z: 0.8})
    })
})
