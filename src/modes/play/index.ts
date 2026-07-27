import {type Scene, type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {SharedWorld} from '../../physics/world.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import {setupPlayerKeyboard} from './keyboard.ts'
import {setupPlayCamera} from './camera.ts'
import {setupHealthBars} from './health_bar.ts'

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
): PlayModeController => {
    characterSystem.setAIEnabled(true)
    characterSystem.activateAI()

    const playerInput = setupPlayerKeyboard(camera, characterSystem)
    const playCameraUpdate = setupPlayCamera(camera, renderer.domElement, () =>
        characterSystem.getPlayerCharacter()?.mesh.position,
    )
    const healthBarUpdate = setupHealthBars(
        scene,
        () => characterSystem.getPlayerCharacter(),
        () => characterSystem.getAll(),
    ).update

    const updater = (dt: number): void => {
        playerInput()
        characterSystem.update(dt)
        playCameraUpdate()
        healthBarUpdate(camera, dt)
    }

    return {updater}
}
