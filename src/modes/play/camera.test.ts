import {describe, it, expect, vi, beforeEach} from 'vitest'
import {PerspectiveCamera, Vector3} from 'three'
import {setupPlayCamera} from './camera.ts'
import {createInputRegistry, getInputRegistry} from '../../input/registry.ts'
import {DEFAULT_BINDINGS} from '../../input/constants.ts'
import {INPUT_ACTIONS, type BindingsMap} from '../../input/types.ts'

/** 构造带像素位移的 mousemove（happy-dom 的 MouseEvent 不支持 movementX/Y 初始化） */
const moveEvent = (x: number, y: number): MouseEvent => {
    const e = new MouseEvent('mousemove', {bubbles: true})
    Object.defineProperty(e, 'movementX', {value: x})
    Object.defineProperty(e, 'movementY', {value: y})
    return e
}

/** 将「锁定目标」改绑到 KeyQ（克隆默认绑定后覆盖） */
const bindLockTargetToKeyQ = (): void => {
    const bindings = {} as BindingsMap
    for (const action of INPUT_ACTIONS) {
        bindings[action] = DEFAULT_BINDINGS[action].map(combo => [...combo])
    }
    bindings.lock_target = [['KeyQ']]
    getInputRegistry().setBindings(bindings)
}

describe('setupPlayCamera：镜头锁定输入', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    it('拖拽超过点击阈值后才解除锁定（攻击点击抖动不解除）', () => {
        const element = document.createElement('div')
        const onOrbit = vi.fn()
        const update = setupPlayCamera(
            new PerspectiveCamera(),
            element,
            () => undefined,
            undefined,
            {onToggle: vi.fn(), getAimPoint: () => undefined, onOrbit},
        )

        element.dispatchEvent(new MouseEvent('mousedown', {button: 0, bubbles: true, cancelable: true}))
        window.dispatchEvent(moveEvent(1, 0))
        expect(onOrbit).not.toHaveBeenCalled()

        window.dispatchEvent(moveEvent(5, 0))
        expect(onOrbit).toHaveBeenCalledTimes(1)

        window.dispatchEvent(new MouseEvent('mouseup', {button: 0, bubbles: true}))
        update(1 / 60)
    })

    it('「锁定目标」改绑键盘后按下触发切换', () => {
        const onToggle = vi.fn()
        const playerTarget = new Vector3(0, 0.5, 0)
        const update = setupPlayCamera(
            new PerspectiveCamera(),
            document.createElement('div'),
            () => playerTarget,
            undefined,
            {onToggle, getAimPoint: () => undefined, onOrbit: vi.fn()},
        )
        bindLockTargetToKeyQ()

        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyQ'}))
        update(1 / 60)
        expect(onToggle).toHaveBeenCalledTimes(1)
    })
})
