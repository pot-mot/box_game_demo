import {type Scene, type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {SharedWorld} from '../../physics/world.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import {setupPlayer} from '../../entity/player/physics/world.ts'
import {setupPlayerKeyboard} from './keyboard.ts'
import {setupPlayCamera} from './camera.ts'

export interface PlayModeController {
    updater: () => void
    respawnPlayer: (x: number, y: number, z: number) => void
    getPlayerBodyPosition: () => { x: number; y: number; z: number } | undefined
}

/** 计算玩家安全出生 Y 坐标：取地形最高点 + 半身高 + 额外间隙 */
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
    const player = setupPlayer(scene, shared)
    player.spawn(0, getPlayerSpawnY(terrainSources), 0)
    const playerInput = setupPlayerKeyboard(camera, player)
    const playCameraUpdate = setupPlayCamera(camera, renderer.domElement, () => {
        const p = player.getPlayer()
        return p ? p.mesh.position : undefined
    })

    const updater = (): void => {
        player.syncPositions()
        playerInput()
        playCameraUpdate()
    }

    const respawnPlayer = (x: number, y: number, z: number): void => {
        player.remove()
        player.spawn(x, y, z)
    }

    const getPlayerBodyPosition = () => {
        const p = player.getPlayer()
        return p?.body.position
    }

    return {updater, respawnPlayer, getPlayerBodyPosition}
}
