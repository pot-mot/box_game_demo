import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {PerspectiveCamera, Vector3} from 'three'
import {createInputRegistry} from '../../input/registry.ts'
import {createOrbitCamera} from './scene.ts'
import {MOVE_STEP} from '../constants.ts'

/**
 * 展示相机自由飞行回归：所有展示子模块的相机以 edit 模式自由飞行为基准
 * （WASD 前后左右 + Z 升 X 降），聚焦时暂停自由移动、Esc 恢复自由飞行。
 */
describe('展示相机：自由飞行 + 聚焦', () => {
    let camera: PerspectiveCamera
    let events: AbortController
    let orbit: ReturnType<typeof createOrbitCamera>

    const press = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', {code})) }
    const release = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keyup', {code})) }

    beforeEach(() => {
        /* 每个用例重建注册表以清空按键状态（getInputRegistry 依赖其先创建） */
        createInputRegistry()
        camera = new PerspectiveCamera()
        events = new AbortController()
        orbit = createOrbitCamera(camera, document.createElement('canvas'), events.signal)
    })

    afterEach(() => {
        events.abort()
    })

    it('未聚焦时 WASD 沿相机朝向平移（默认 yaw=0 → 前为 -Z），Z/X 升降', () => {
        const start = orbit.target.clone()

        press('KeyW')
        orbit.update(1 / 60)
        release('KeyW')
        expect(orbit.target.z).toBeCloseTo(start.z - MOVE_STEP)
        expect(orbit.target.x).toBeCloseTo(start.x)

        press('KeyD')
        orbit.update(1 / 60)
        release('KeyD')
        expect(orbit.target.x).toBeGreaterThan(start.x)

        const beforeUp = orbit.target.y
        press('KeyZ')
        orbit.update(1 / 60)
        release('KeyZ')
        expect(orbit.target.y).toBeCloseTo(beforeUp + MOVE_STEP)

        press('KeyX')
        orbit.update(1 / 60)
        release('KeyX')
        expect(orbit.target.y).toBeCloseTo(beforeUp)
    })

    it('聚焦时暂停自由移动，Esc 恢复自由飞行', () => {
        const focus = new Vector3(3, 1, 3)
        orbit.focusTo(focus)
        for (let i = 0; i < 120; i++) orbit.update(1 / 60)
        expect(orbit.target.distanceTo(focus)).toBeLessThan(0.05)

        const focusedTarget = orbit.target.clone()
        press('KeyW')
        orbit.update(1 / 60)
        release('KeyW')
        /* 聚焦期间键盘位移被忽略（仅剩 lerp 收敛残差，远小于一帧 MOVE_STEP） */
        expect(orbit.target.distanceTo(focusedTarget)).toBeLessThan(MOVE_STEP / 10)

        /* Esc 解除聚焦后自由飞行恢复 */
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape'}))
        press('KeyW')
        orbit.update(1 / 60)
        release('KeyW')
        expect(orbit.target.z).toBeLessThan(focusedTarget.z)
    })

    it('跟随目标时相机目标持续跟随（原地更新向量）', () => {
        const follow = new Vector3(5, 1.4, -5)
        orbit.setFollow(follow)
        for (let i = 0; i < 120; i++) orbit.update(1 / 60)
        expect(orbit.target.distanceTo(follow)).toBeLessThan(0.1)

        /* 更新跟随向量后目标继续跟随 */
        follow.set(8, 1.4, -2)
        for (let i = 0; i < 120; i++) orbit.update(1 / 60)
        expect(orbit.target.distanceTo(follow)).toBeLessThan(0.1)

        /* 跟随时 WASD 不移动相机（跟随优先） */
        const before = orbit.target.clone()
        press('KeyW')
        orbit.update(1 / 60)
        release('KeyW')
        expect(orbit.target.distanceTo(before)).toBeLessThan(MOVE_STEP / 10)
    })
})
