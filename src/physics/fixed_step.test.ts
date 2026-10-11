import {describe, it, expect, beforeAll} from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from './world.ts'
import {createFixedStepStepper} from './fixed_step.ts'
import {setBodyMass} from './rapier_utils.ts'
import {FIXED_TIME_STEP, GRAVITY} from './constants.ts'

/**
 * 回归：独立物理世界（展示模式 AI×复杂地形子模块等）必须每个物理子步结束后清除累积力。
 * 曾经的缺陷是模块自建 `SharedWorld` 却漏注册 `clearAllForces`：idle / 站定攻击施加的坡面反重力力
 * 残留后抵消重力，角色跳跃后上升速度永不衰减、持续升空。
 */
describe('独立物理世界的固定子步运行器', () => {
    beforeAll(async () => {
        await RAPIER.init()
    })

    /** 空中动态球体：质量 1，重力作用下应持续下落 */
    const spawnAirborneBody = (shared: ReturnType<typeof createSharedWorld>): RAPIER.RigidBody => {
        const body = shared.world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 100, 0),
        )
        shared.world.createCollider(RAPIER.ColliderDesc.ball(0.5).setDensity(0), body)
        setBodyMass(body, 1)
        return body
    }

    it('每子步清除累积力：一次性反重力力残留不会让刚体持续升空', () => {
        const shared = createSharedWorld()
        const stepper = createFixedStepStepper(shared, [])
        const body = spawnAirborneBody(shared)

        /* 模拟 idle 的坡面反重力：一次性施加恰好抵消重力的向上力（此后不再施加） */
        body.resetForces(true)
        body.addForce({x: 0, y: -body.mass() * GRAVITY, z: 0}, true)

        for (let i = 0; i < 5; i++) stepper(FIXED_TIME_STEP, 0)

        /* 若力残留：向上力每子步抵消重力，linvel.y 恒为 ~0；清力后重力接管，速度持续向下 */
        expect(body.linvel().y).toBeLessThan(-0.1)
    })

    it('无外力时刚体正常下落（对照）', () => {
        const shared = createSharedWorld()
        const stepper = createFixedStepStepper(shared, [])
        const body = spawnAirborneBody(shared)

        for (let i = 0; i < 5; i++) stepper(FIXED_TIME_STEP, 0)

        expect(body.linvel().y).toBeLessThan(-0.1)
    })
})
