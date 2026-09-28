import {Vector3, type PerspectiveCamera} from 'three'
import type {CharacterEntitySystem} from '../../../entity/character/physics/world.ts'
import type {InteractionProvider, InteractionTarget} from '../../../character/interaction/types.ts'
import {INTERACTION_ACTIVATE_TIME} from '../../../character/interaction/types.ts'
import {getInputRegistry} from '../../../input/registry.ts'
import {pickInteraction} from './resolve.ts'
import {createInteractionPrompt} from './prompt.ts'

export interface PlayInteractionController {
    /** 每帧调用（必须早于 characterSystem.update，交互脉冲同帧生效） */
    update: (dt: number) => void
    registerProvider: (provider: InteractionProvider) => void
    getCurrentTarget: () => InteractionTarget | undefined
    dispose: () => void
}

export const setupPlayInteraction = (
    camera: PerspectiveCamera,
    characterSystem: CharacterEntitySystem,
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

    const update = (dt: number): void => {
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) {
            currentTarget = undefined
            pendingKey = undefined
            awaitingEntry = false
            prompt.update(undefined)
            return
        }

        const pos = player.body.translation()
        camera.getWorldDirection(forward)
        forward.y = 0

        candidates.length = 0
        for (const provider of providers) provider.collectInteractionTargets(pos.x, pos.y, pos.z, candidates)
        currentTarget = pickInteraction(candidates, pos.x, pos.y, pos.z, forward.x, forward.z)

        const justPressed = input.wasActionPressed('interact') && input.isActionActive('interact')

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

        prompt.update(currentTarget)
    }

    const registerProvider = (provider: InteractionProvider): void => {
        providers.push(provider)
    }
    const getCurrentTarget = (): InteractionTarget | undefined => currentTarget
    const dispose = (): void => {
        prompt.dispose()
        providers.length = 0
    }

    return {update, registerProvider, getCurrentTarget, dispose}
}
