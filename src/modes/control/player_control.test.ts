import {describe, it, expect, vi, beforeEach} from 'vitest'
import {PerspectiveCamera, Vector3} from 'three'
import {createInputRegistry, getInputRegistry} from '../../input/registry.ts'
import {DEFAULT_BINDINGS} from '../../input/constants.ts'
import {INPUT_ACTIONS, MOUSE_ACTIONS_BY_MODE, type BindingsMap} from '../../input/types.ts'
import {createPlayerControl} from './player_control.ts'

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

const press = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', {code})) }
const release = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keyup', {code})) }

type MoveFn = (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, roll: boolean, swimLift: number, sprint: boolean, fly: boolean, flyLift: number) => void

const baseOptions = (move: MoveFn) => ({
    getTarget: () => new Vector3(0, 0.5, 0),
    move,
    pointerActions: MOUSE_ACTIONS_BY_MODE.play,
})

describe('玩家主控：相机与移动', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    it('拖拽超过点击阈值后才解除锁定（攻击点击抖动不解除）', () => {
        const element = document.createElement('div')
        const onOrbit = vi.fn()
        const control = createPlayerControl(new PerspectiveCamera(), element, {
            ...baseOptions(vi.fn<MoveFn>()),
            lock: {onToggle: vi.fn(), getAimPoint: () => undefined, onOrbit},
        })

        element.dispatchEvent(new MouseEvent('mousedown', {button: 0, bubbles: true, cancelable: true}))
        window.dispatchEvent(moveEvent(1, 0))
        expect(onOrbit).not.toHaveBeenCalled()

        window.dispatchEvent(moveEvent(5, 0))
        expect(onOrbit).toHaveBeenCalledTimes(1)

        window.dispatchEvent(new MouseEvent('mouseup', {button: 0, bubbles: true}))
        control.update(1 / 60)
    })

    it('「锁定目标」改绑键盘后按下触发切换', () => {
        const onToggle = vi.fn()
        const control = createPlayerControl(new PerspectiveCamera(), document.createElement('div'), {
            ...baseOptions(vi.fn<MoveFn>()),
            lock: {onToggle, getAimPoint: () => undefined, onOrbit: vi.fn()},
        })
        bindLockTargetToKeyQ()

        press('KeyQ')
        control.update(1 / 60)
        expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('move() 将 WASD 合成相机水平方向并输出翻滚边沿', () => {
        const move = vi.fn<MoveFn>()
        const control = createPlayerControl(new PerspectiveCamera(), document.createElement('div'), baseOptions(move))

        press('KeyW')
        control.move()
        release('KeyW')
        const first = move.mock.calls[0]
        /* 默认 yaw=π：水平前向 = (-sin π, -cos π) = (0, 1) */
        expect(first[3]).toBeCloseTo(0)
        expect(first[4]).toBeCloseTo(1)
        expect(first[5]).toBe(false)

        /* Shift（roll 动作）短按：松开时才触发翻滚 */
        press('ShiftLeft')
        control.move()
        expect(move.mock.calls.at(-1)?.[5]).toBe(false)
        expect(move.mock.calls.at(-1)?.[7]).toBe(false)
        release('ShiftLeft')
        control.move()
        expect(move.mock.calls.at(-1)?.[5]).toBe(true)
        expect(move.mock.calls.at(-1)?.[7]).toBe(false)
    })

    it('长按翻滚键只进入跑步，不会触发翻滚；松开停止跑步', () => {
        let now = 0
        const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)
        const move = vi.fn<MoveFn>()
        const control = createPlayerControl(new PerspectiveCamera(), document.createElement('div'), baseOptions(move))

        press('KeyW')
        press('ShiftLeft')
        control.move()
        expect(move.mock.calls.at(-1)?.[5]).toBe(false)
        expect(move.mock.calls.at(-1)?.[7]).toBe(false)

        now = 350
        control.move()
        expect(move.mock.calls.at(-1)?.[5]).toBe(false)
        expect(move.mock.calls.at(-1)?.[7]).toBe(true)

        release('ShiftLeft')
        control.move()
        expect(move.mock.calls.at(-1)?.[5]).toBe(false)
        expect(move.mock.calls.at(-1)?.[7]).toBe(false)
        nowSpy.mockRestore()
    })

    it('聚焦接口：focusTo / isFocused 切换，Esc 取消聚焦并回归原观察距离', () => {
        const camera = new PerspectiveCamera()
        const target = new Vector3(0, 0.5, 0)
        const control = createPlayerControl(camera, document.createElement('div'), {
            getTarget: () => target,
            move: vi.fn<MoveFn>(),
            pointerActions: MOUSE_ACTIONS_BY_MODE.play,
        })

        control.update(1 / 60)
        const initialDistance = camera.position.distanceTo(target)

        expect(control.isFocused()).toBe(false)
        const focus = new Vector3(20, 1, 20)
        control.focusTo(focus, 3)
        expect(control.isFocused()).toBe(true)
        for (let i = 0; i < 180; i++) control.update(1 / 60)
        /* 聚焦收敛：相机贴近聚焦点、距离收敛到聚焦距离 */
        expect(camera.position.distanceTo(focus)).toBeCloseTo(3, 1)

        /* Esc 取消聚焦：目标回到玩家、观察距离平滑回归初始值 */
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape'}))
        expect(control.isFocused()).toBe(false)
        for (let i = 0; i < 300; i++) control.update(1 / 60)
        expect(camera.position.distanceTo(target)).toBeCloseTo(initialDistance, 1)
    })
})
