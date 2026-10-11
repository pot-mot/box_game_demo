import {describe, it, expect, beforeEach} from 'vitest'
import {BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3} from 'three'
import {createInputRegistry} from '../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
import {createCameraControl} from '../control/camera_control.ts'
import {setupClickFocus} from './focus.ts'

describe('展示模式：点击聚焦拾取器', () => {
    beforeEach(() => {
        /* getInputRegistry 依赖先创建注册表（读取聚焦指针动作绑定） */
        createInputRegistry()
    })

    it('点击命中对象后相机平滑聚焦到目标点、标记环显示并呼吸（距离随目标）', () => {
        const scene = new Scene()
        const camera = new PerspectiveCamera(55, 1, 0.1, 100)
        camera.position.set(0, 0, 6)
        camera.lookAt(0, 0, 0)
        camera.updateMatrixWorld()

        const dom = document.createElement('div')
        const events = new AbortController()
        const orbit = createCameraControl(camera, dom, {pointerActions: MOUSE_ACTIONS_BY_MODE.showcase, signal: events.signal})

        const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
        mesh.updateMatrixWorld()

        const focused: Array<number | null> = []
        let resolvedPoint: Vector3 | undefined
        const controller = setupClickFocus<number>({
            scene,
            camera,
            domElement: dom,
            orbit,
            getObjects: () => [mesh],
            resolve: hit => {
                resolvedPoint = hit.point.clone()
                return {point: resolvedPoint, value: 7, distance: 9, marker: new Vector3(0, 0.02, 0), markerScale: 2}
            },
            onFocus: value => focused.push(value),
        })

        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        dom.dispatchEvent(new MouseEvent('mousedown', {clientX: cx, clientY: cy, button: 0}))
        dom.dispatchEvent(new MouseEvent('mouseup', {clientX: cx, clientY: cy, button: 0}))

        expect(focused).toEqual([7])
        expect(resolvedPoint).toBeDefined()
        /* 标记环显示在目标脚下并放大 */
        const ring = scene.children.find(obj => obj.type === 'Mesh') as Mesh | undefined
        expect(ring?.visible).toBe(true)
        expect(ring?.position.toArray()).toEqual([0, 0.02, 0])
        expect(ring?.scale.x).toBe(2)

        /* 多次 update 后 target 应逼近命中点（聚焦生效） */
        for (let i = 0; i < 60; i++) orbit.update(1 / 60)
        expect(orbit.target.distanceTo(resolvedPoint ?? new Vector3())).toBeLessThan(0.1)

        controller.dispose()
        events.abort()
    })

    it('点击空处取消聚焦并隐藏标记环', () => {
        const scene = new Scene()
        const camera = new PerspectiveCamera(55, 1, 0.1, 100)
        camera.position.set(0, 0, 6)
        camera.updateMatrixWorld()
        const dom = document.createElement('div')
        const events = new AbortController()
        const orbit = createCameraControl(camera, dom, {pointerActions: MOUSE_ACTIONS_BY_MODE.showcase, signal: events.signal})

        const focused: Array<number | null> = []
        const controller = setupClickFocus<number>({
            scene,
            camera,
            domElement: dom,
            orbit,
            getObjects: () => [],
            resolve: () => undefined,
            onFocus: value => focused.push(value),
        })

        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        dom.dispatchEvent(new MouseEvent('mousedown', {clientX: cx, clientY: cy, button: 0}))
        dom.dispatchEvent(new MouseEvent('mouseup', {clientX: cx, clientY: cy, button: 0}))
        expect(focused).toEqual([null])

        controller.dispose()
        events.abort()
    })
})
