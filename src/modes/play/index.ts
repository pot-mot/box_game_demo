import {type Scene, type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {SharedWorld} from '../../physics/world.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import {setupCharacter} from '../../entity/character/physics/world.ts'
import {setupPlayerKeyboard} from './keyboard.ts'
import {setupPlayCamera} from './camera.ts'

export interface PlayModeController {
    updater: (dt: number) => void
    respawnPlayer: (x: number, y: number, z: number) => void
    getPlayerBodyPosition: () => { x: number; y: number; z: number } | undefined
}

const getPlayerSpawnY = (terrains: readonly TerrainContext[]): number => {
    let maxH = 0
    for (const t of terrains) {
        const h = t.getHeightAt(0, 0, 1)
        if (h !== undefined && h > maxH) maxH = h
    }
    return maxH + 0.5 + 0.3
}

export const setupPlayMode = (
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    shared: SharedWorld,
    terrainSources: TerrainContext[],
): PlayModeController => {
    const character = setupCharacter(scene, shared)
    character.spawn(0, getPlayerSpawnY(terrainSources), 0)
    const playerInput = setupPlayerKeyboard(camera, character.stateMachine)
    const playCameraUpdate = setupPlayCamera(camera, renderer.domElement, () =>
        character.getCharacter()?.mesh.position,
    )

    const updater = (dt: number): void => {
        playerInput()
        character.update(dt)
        playCameraUpdate()
    }

    const respawnPlayer = (x: number, y: number, z: number): void => {
        character.remove()
        character.spawn(x, y, z)
    }

    const getPlayerBodyPosition = () => {
        const p = character.getCharacter()
        return p?.body.position
    }

    return {updater, respawnPlayer, getPlayerBodyPosition}
}
