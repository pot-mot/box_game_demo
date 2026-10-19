import {Vector3, type PerspectiveCamera} from 'three'
import type {InteractionProvider, InteractionTarget} from '../../../character/interaction/types.ts'
import {INTERACTION_ACTIVATE_TIME} from '../../../character/interaction/types.ts'
import type {CharacterState} from '../../../character/state_machine/types.ts'
import {getInputRegistry} from '../../../input/registry.ts'
import {pickInteraction} from './resolve.ts'
import {createInteractionPrompt} from './prompt.ts'

/** 交互控制器所需的最小角色视图（便于单测注入，不依赖完整实体系统） */
export interface InteractionActorView {
    readonly body: {readonly translation: () => {readonly x: number; readonly y: number; readonly z: number}}
    readonly stateMachine: {readonly currentState: CharacterState}
}

export interface PlayInteractionCharacterSource {
    getPlayerCharacter: () => InteractionActorView | undefined
    setPlayerInteract: (pending: boolean, targetX: number, targetZ: number) => void
}

export interface PlayInteractionController {
    /**
     * 每渲染帧一次、物理步进前：捕获交互按下边沿、解析当前目标并更新提示。
     * 边沿在此锁存，避免高刷下「0 物理步」渲染帧被 input 清理而丢输入。
     */
    sampleInput: () => void
    /** 每物理步：交互计时与激活（锁存边沿只在首个物理步消费一次） */
    fixedUpdate: (dt: number) => void
    registerProvider: (provider: InteractionProvider) => void
    getCurrentTarget: () => InteractionTarget | undefined
    dispose: () => void
}

export const setupPlayInteraction = (
    camera: PerspectiveCamera,
    characterSystem: PlayInteractionCharacterSource,
): PlayInteractionController => {
    const input = getInputRegistry()
    const prompt = createInteractionPrompt()
    const providers: InteractionProvider[] = []
    const candidates: InteractionTarget[] = []
    const forward = new Vector3()

    let currentTarget: InteractionTarget | undefined
    let pendingKey: string | undefined
    let awaitingEntry = false
    let activationTimer = 0
    let fired = false
    /** 交互按下边沿锁存：渲染帧采样、首个物理步消费 */
    let interactLatched = false

    /** 每渲染帧：捕获边沿 + 解析目标 + 更新提示（不推进计时） */
    const sampleInput = (): void => {
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) {
            currentTarget = undefined
            pendingKey = undefined
            awaitingEntry = false
            interactLatched = false
            prompt.update(undefined)
            return
        }

        const pos = player.body.translation()
        camera.getWorldDirection(forward)
        forward.y = 0

        candidates.length = 0
        for (const provider of providers) provider.collectInteractionTargets(pos.x, pos.y, pos.z, candidates)
        currentTarget = pickInteraction(candidates, pos.x, pos.y, pos.z, forward.x, forward.z)

        if (input.wasActionPressed('interact') && input.isActionActive('interact')) interactLatched = true
        prompt.update(currentTarget)
    }

    /** 每物理步：交互计时与激活 */
    const fixedUpdate = (dt: number): void => {
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) {
            interactLatched = false
            return
        }

        const justPressed = interactLatched
        interactLatched = false

        if (player.stateMachine.currentState === 'interacting') {
            if (awaitingEntry) {
                awaitingEntry = false
                activationTimer = 0
                fired = false
            }
            activationTimer += dt
            if (!fired && activationTimer >= INTERACTION_ACTIVATE_TIME) {
                fired = true
                if (pendingKey !== undefined) {
                    for (const provider of providers) {
                        if (provider.activateInteraction?.(pendingKey) === true) break
                    }
                }
            }
        } else if (awaitingEntry && !justPressed) {
            /* 状态机未接受交互（翻滚 / 攻击 / 空中等）：丢弃挂起的激活 */
            awaitingEntry = false
            pendingKey = undefined
        }

        if (justPressed && currentTarget !== undefined) {
            pendingKey = currentTarget.key
            awaitingEntry = true
            characterSystem.setPlayerInteract(true, currentTarget.x, currentTarget.z)
        }
    }

    const registerProvider = (provider: InteractionProvider): void => {
        providers.push(provider)
    }
    const getCurrentTarget = (): InteractionTarget | undefined => currentTarget
    const dispose = (): void => {
        prompt.dispose()
        providers.length = 0
    }

    return {sampleInput, fixedUpdate, registerProvider, getCurrentTarget, dispose}
}
