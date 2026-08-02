import {type Scene, type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {SharedWorld} from '../../physics/world.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import type {SpawnBoxCallback} from '../../entity/character/ai/types.ts'
import {setupPlayerKeyboard} from './keyboard.ts'
import {setupPlayCamera} from './camera.ts'
import {setupHealthBars} from './health_bar.ts'
import type {TimerRowData} from './player_hud.ts'
import {createPlayerHUD} from './player_hud.ts'
import {createDeathScreen} from './death_screen.ts'
import {DASH_DURATION, DASH_COOLDOWN} from '../../character/state_machine/constants.ts'

export interface PlayModeController {
    updater: (dt: number) => void
}

export const setupPlayMode = (
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    _shared: SharedWorld,
    _terrainSources: TerrainContext[],
    characterSystem: CharacterEntitySystem,
    boxSpawner: SpawnBoxCallback,
): PlayModeController => {
    characterSystem.setAIEnabled(true)
    characterSystem.activateAI()
    characterSystem.registerBoxSpawner(boxSpawner)

    const playerInput = setupPlayerKeyboard(camera, characterSystem)
    const playCameraUpdate = setupPlayCamera(camera, renderer.domElement, () =>
        characterSystem.getPlayerCharacter()?.mesh.position,
        {
            onLightAttack: () => characterSystem.setPlayerAttack(0),
            onHeavyAttack: () => characterSystem.setPlayerAttack(1),
        },
    )
    const healthBarUpdate = setupHealthBars(
        scene,
        () => characterSystem.getPlayerCharacter(),
        () => characterSystem.getAll(),
    ).update

    const hud = createPlayerHUD()
    let playerDied = false
    let hadPlayer = false
    const deathScreen = createDeathScreen(
        () => { location.reload() },
        () => { location.reload() },
    )

    const updater = (dt: number): void => {
        playerInput()
        characterSystem.update(dt)
        playCameraUpdate()
        healthBarUpdate(camera, dt)

        const player = characterSystem.getPlayerCharacter()
        if (player) {
            hadPlayer = true
            hud.setVisible(true)
            const skill = player.combat.skills[player.combat.currentSkillIndex]
            const isDashing = player.stateMachine.currentState === 'dashing'

            const timers: TimerRowData[] = []

            if (player.combat.attackActive) {
                const dur = skill?.config.duration ?? 0
                timers.push({
                    label: 'ATK',
                    fillRatio: dur > 0 ? Math.min(1, player.combat.attackTimer / dur) : 0,
                    fillColor: '#ffaa00',
                    text: `${player.combat.attackTimer.toFixed(1)}s / ${dur.toFixed(1)}s`,
                    visible: true,
                })
            }

            if (isDashing) {
                timers.push({
                    label: 'DASH',
                    fillRatio: Math.min(1, player.stateMachine.stateTime / DASH_DURATION),
                    fillColor: '#44ff44',
                    text: `${player.stateMachine.stateTime.toFixed(1)}s / ${DASH_DURATION.toFixed(1)}s`,
                    visible: true,
                })
            } else {
                const cd = player.dashCooldownTimer
                timers.push({
                    label: 'DASH',
                    fillRatio: cd > 0 ? 1 - cd / DASH_COOLDOWN : 1,
                    fillColor: cd > 0 ? '#ff6644' : '#44ff44',
                    text: cd > 0 ? `${cd.toFixed(1)}s` : 'RDY',
                    visible: true,
                })
            }

            for (let i = 0; i < player.combat.skills.length; i++) {
                const s = player.combat.skills[i]
                const cd = s.cooldownTimer
                const cdMax = s.config.cooldown
                timers.push({
                    label: `SK${i}`,
                    fillRatio: cdMax > 0 ? 1 - cd / cdMax : 1,
                    fillColor: cd > 0 ? '#ff6644' : '#4488ff',
                    text: cd > 0 ? `${cd.toFixed(1)}s` : 'RDY',
                    visible: true,
                })
            }

            hud.update({
                health: player.combat.health,
                maxHealth: player.combat.maxHealth,
                stateName: player.stateMachine.currentState,
                stateTime: player.stateMachine.stateTime,
                timers,
            })
        } else {
            hud.setVisible(false)
            if (hadPlayer && !playerDied) {
                playerDied = true
                deathScreen.show()
            }
        }
    }

    return {updater}
}
