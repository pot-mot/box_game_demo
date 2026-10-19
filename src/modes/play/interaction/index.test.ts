import {describe, it, expect, beforeEach, vi} from 'vitest'
import {PerspectiveCamera} from 'three'
import {createInputRegistry} from '../../../input/registry.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import {INTERACTION_ACTIVATE_TIME, type InteractionProvider} from '../../../character/interaction/types.ts'
import type {CharacterState} from '../../../character/state_machine/types.ts'
import {setupPlayInteraction, type PlayInteractionCharacterSource} from './index.ts'

const pressInteract = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyF'}))
}

describe('play 交互：渲染帧采样 / 物理步消费', () => {
    let input: ReturnType<typeof createInputRegistry>

    beforeEach(() => {
        localStorage.clear()
        input = createInputRegistry()
    })

    it('0 物理步渲染帧清理边沿后，仍在首个物理步消费交互输入', () => {
        const camera = new PerspectiveCamera()
        let state: CharacterState = 'idle'
        const setPlayerInteract = vi.fn()
        const source: PlayInteractionCharacterSource = {
            getPlayerCharacter: () => ({
                body: {translation: () => ({x: 0, y: 0, z: 0})},
                stateMachine: {get currentState() { return state }},
            }),
            setPlayerInteract,
        }
        const activate = vi.fn(() => true)
        const provider: InteractionProvider = {
            collectInteractionTargets: (_x, _y, _z, out) => {
                out.push({key: 'test', kind: 'chest', prompt: '', x: 0, y: 0, z: -1, score: 0})
                return 1
            },
            activateInteraction: activate,
        }
        const controller = setupPlayInteraction(camera, source)
        controller.registerProvider(provider)

        pressInteract()
        /* 渲染帧：采样并锁存边沿 */
        controller.sampleInput()
        /* 模拟渲染帧末 input 清理按下边沿（高刷下本帧可能是 0 物理步） */
        input.getUpdater()()
        /* 下一个物理步：锁存边沿仍应被消费 */
        controller.fixedUpdate(FIXED_TIME_STEP)
        expect(setPlayerInteract).toHaveBeenCalledTimes(1)
        expect(setPlayerInteract).toHaveBeenCalledWith(true, 0, -1)

        /* 状态机接受交互后，计时到 50% 触发实际效果 */
        state = 'interacting'
        const steps = Math.ceil(INTERACTION_ACTIVATE_TIME / FIXED_TIME_STEP) + 2
        for (let i = 0; i < steps; i++) controller.fixedUpdate(FIXED_TIME_STEP)
        expect(activate).toHaveBeenCalledWith('test')

        controller.dispose()
    })

    it('边沿只消费一次：同帧多个物理步不会重复触发交互脉冲', () => {
        const camera = new PerspectiveCamera()
        const setPlayerInteract = vi.fn()
        const source: PlayInteractionCharacterSource = {
            getPlayerCharacter: () => ({
                body: {translation: () => ({x: 0, y: 0, z: 0})},
                stateMachine: {currentState: 'idle'},
            }),
            setPlayerInteract,
        }
        const provider: InteractionProvider = {
            collectInteractionTargets: (_x, _y, _z, out) => {
                out.push({key: 'test', kind: 'chest', prompt: '', x: 0, y: 0, z: -1, score: 0})
                return 1
            },
            activateInteraction: () => true,
        }
        const controller = setupPlayInteraction(camera, source)
        controller.registerProvider(provider)

        pressInteract()
        controller.sampleInput()
        controller.fixedUpdate(FIXED_TIME_STEP)
        controller.fixedUpdate(FIXED_TIME_STEP)
        expect(setPlayerInteract).toHaveBeenCalledTimes(1)

        controller.dispose()
    })
})
