import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {PerspectiveCamera, Vector3} from 'three'
import {createInputRegistry} from '../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
import {createCameraControl} from './camera_control.ts'

describe('纯摄像机：setOrientation / 缩放门控', () => {
    let events: AbortController

    beforeEach(() => {
        createInputRegistry()
        events = new AbortController()
    })

    afterEach(() => {
        events.abort()
    })

    const make = (): {camera: PerspectiveCamera; control: ReturnType<typeof createCameraControl>} => {
        const camera = new PerspectiveCamera()
        const control = createCameraControl(camera, document.createElement('canvas'), {
            pointerActions: MOUSE_ACTIONS_BY_MODE.edit,
            signal: events.signal,
        })
        control.update(0)
        return {camera, control}
    }

    it('setOrientation 保持相机位置不动（第一人称）', () => {
        const {camera, control} = make()
        camera.position.set(1, 2, 3)
        control.setOrientation(Math.PI / 2, 0)
        expect(camera.position.x).toBeCloseTo(1)
        expect(camera.position.y).toBeCloseTo(2)
        expect(camera.position.z).toBeCloseTo(3)
    })

    it('setZoomEnabled(false) 时滚轮缩放失效', () => {
        const {camera, control} = make()
        const before = camera.position.distanceTo(control.target.clone())
        control.setZoomEnabled(false)
        control.zoomBy(200)
        control.update(0)
        expect(camera.position.distanceTo(control.target.clone())).toBeCloseTo(before)
    })

    it('zoomBy 在启用时改变观察距离（平滑收敛）', () => {
        const {camera, control} = make()
        const before = camera.position.distanceTo(control.target.clone())
        control.zoomBy(200)
        /* 渲染距离逐帧平滑逼近目标距离 */
        for (let i = 0; i < 120; i++) control.update(1 / 60)
        expect(camera.position.distanceTo(control.target.clone())).not.toBeCloseTo(before)
    })

    it('setFollow 跟随时 WASD 不移动目标', () => {
        const {control} = make()
        const follow = new Vector3(4, 1, 4)
        control.setFollow(follow)
        for (let i = 0; i < 120; i++) control.update(1 / 60)
        expect(control.target.distanceTo(follow)).toBeLessThan(0.1)
    })
})
