import {describe, it, expect} from 'vitest'
import {Object3D} from 'three'
import {applyRenderPose, captureObjectRenderPose, resetObjectRenderPose} from './render_interpolation.ts'

describe('渲染插值（滞后一拍）', () => {
    it('按 alpha 在上一 / 当前物理状态之间插值', () => {
        const object = new Object3D()
        object.position.set(0, 0, 0)
        captureObjectRenderPose(object)
        object.position.set(1, 0, 0)
        captureObjectRenderPose(object)

        applyRenderPose(object, 0)
        expect(object.position.x).toBeCloseTo(0, 6)
        applyRenderPose(object, 0.5)
        expect(object.position.x).toBeCloseTo(0.5, 6)
        applyRenderPose(object, 1)
        expect(object.position.x).toBeCloseTo(1, 6)
    })

    it('单步位移超过阈值视为传送：直接吸附，不产生插值滑行', () => {
        const object = new Object3D()
        captureObjectRenderPose(object)
        object.position.set(50, 0, 0)
        captureObjectRenderPose(object)

        applyRenderPose(object, 0)
        expect(object.position.x).toBeCloseTo(50, 6)
    })

    it('reset 后 prev = curr = 当前变换', () => {
        const object = new Object3D()
        object.position.set(0, 0, 0)
        captureObjectRenderPose(object)
        object.position.set(3, 0, 0)
        captureObjectRenderPose(object)
        object.position.set(5, 0, 0)
        resetObjectRenderPose(object)

        applyRenderPose(object, 0)
        expect(object.position.x).toBeCloseTo(5, 6)
    })

    it('无历史时返回 false，由调用方回退真实状态', () => {
        const object = new Object3D()
        expect(applyRenderPose(object, 0.5)).toBe(false)
    })
})
