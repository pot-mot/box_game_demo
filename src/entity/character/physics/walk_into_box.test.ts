import {beforeAll, describe, it, expect} from 'vitest'
import {createHarnessWorld, initRapier, makeChar, makeStaticBox, initGS, stepWorld, type HarnessWorld} from './harness.ts'
import {queryColliderContacts} from '../../../physics/contact_tracking.ts'
import {resolveGroundState, type GroundState} from './ground_state.ts'
import {collisionCategoryOf} from '../../../physics/collision_category.ts'
import type {CharacterEntity} from '../../../character/types.ts'

beforeAll(async () => {
    await initRapier()
})

const DT = 1 / 60

interface WalkStats {
    maxY: number
    maxUpVy: number
    fallingFrames: number
    states: Set<string>
}

/**
 * 手写帧循环（step → 地面检测 → 状态机），镜像 `world.ts` 的消费方式。
 * 用 `queryColliderContacts`（接触流形法线）而非 `Collider.contactCollider`。
 */
const walkInto = (
    place: (hw: HarnessWorld) => void,
    start: {x: number; z: number},
    dir: {dx: number; dz: number},
    frames = 240,
): WalkStats => {
    const hw = createHarnessWorld()
    place(hw)
    const entity: CharacterEntity = makeChar(hw, 1, start.x, 0.5, start.z, 6)
    let gs: GroundState = initGS()
    const stats: WalkStats = {maxY: 0.5, maxUpVy: 0, fallingFrames: 0, states: new Set()}
    for (let i = 0; i < frames; i++) {
        stepWorld(hw)
        const contacts = queryColliderContacts(hw.shared.world, entity.mainCollider, hw.tracker.pairsInvolving(entity.mainCollider.handle))
            .filter(c => collisionCategoryOf(c.otherCollisionGroups) !== 'character')
        const next = resolveGroundState(contacts, entity.body.handle, gs, DT)
        entity.isOnGround = next.isOnGround
        entity.groundNormal = next.groundNormal
        entity.groundKeepTimer = next.groundKeepTimer
        gs = next
        entity.stateMachine.setInput(dir.dx, dir.dz, false, false, false)
        entity.stateMachine.update(DT, entity)

        const p = entity.body.translation()
        const vy = entity.body.linvel().y
        stats.maxY = Math.max(stats.maxY, p.y)
        stats.states.add(entity.stateMachine.currentState)
        if (entity.stateMachine.currentState === 'walking') stats.maxUpVy = Math.max(stats.maxUpVy, vy)
        if (entity.stateMachine.currentState === 'falling') stats.fallingFrames++
    }
    return stats
}

/** 与展示背包箱子同形（半尺寸 0.5×0.4×0.35，坐落平地） */
const chest = (hw: HarnessWorld): void => { makeStaticBox(hw, 0, 0.4, 0, 0.5, 0.4, 0.35) }

/**
 * 回归：平地走向箱子不得被弹起 / 误判 falling。
 *
 * 旧实现用 `Collider.contactCollider(other, 0.1)` 取地面法线，角色同时接触地面与箱体时
 * 会读到被污染的对角法线（平地 ground 法线读成 (0.86,-0.28,-0.43)），行走状态的坡面投影
 * 把水平速度转成大垂直速度（被弹飞，maxUpVy 达 5 m/s），随后空中只剩箱体水平法线而误判
 * falling。改用接触流形（`world.contactPair`）后地面法线保持竖直。
 */
describe('平地走向箱子：地面法线不被箱体污染', () => {
    const assertGrounded = (stats: WalkStats): void => {
        expect(stats.maxY).toBeLessThan(0.52)
        expect(stats.maxUpVy).toBeLessThan(0.1)
        expect(stats.fallingFrames).toBe(0)
        expect(stats.states.has('jumping')).toBe(false)
        expect(stats.states.has('falling')).toBe(false)
    }

    it('正面直走撞箱（展示背包场景）', () => {
        assertGrounded(walkInto(chest, {x: 0, z: 3.5}, {dx: 0, dz: -1}))
    })

    it('斜向撞箱角', () => {
        assertGrounded(walkInto(chest, {x: -1.5, z: -1.5}, {dx: 0.707, dz: 0.707}))
    })

    it('沿箱子前侧擦过', () => {
        assertGrounded(walkInto(chest, {x: -2, z: 0.5}, {dx: 1, dz: 0}))
    })

    it('两箱夹缝穿行', () => {
        assertGrounded(walkInto(hw => {
            makeStaticBox(hw, 0, 0.4, 0, 0.5, 0.4, 0.35)
            makeStaticBox(hw, 0, 0.4, -0.7, 0.5, 0.4, 0.35)
        }, {x: 0, z: -3}, {dx: 0, dz: 1}))
    })
})
