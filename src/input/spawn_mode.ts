import {type SpawnMode} from '../types/spawnMode.ts'

const SPAWN_MODES: SpawnMode[] = ['box/common', 'box/destruction', 'box/water', 'box/burning', 'box/magnet']

export const setupSpawnModeManager = (): {
    getSpawnMode: () => SpawnMode
    setSpawnMode: (mode: SpawnMode) => void
    cycleSpawnMode: (direction: -1 | 1) => void
} => {
    let index = 0

    const getSpawnMode = (): SpawnMode => SPAWN_MODES[index]

    const setSpawnMode = (mode: SpawnMode): void => {
        index = SPAWN_MODES.indexOf(mode)
    }

    const cycleSpawnMode = (direction: -1 | 1): void => {
        index = (index + direction + SPAWN_MODES.length) % SPAWN_MODES.length
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'ArrowUp') cycleSpawnMode(-1)
        if (e.code === 'ArrowDown') cycleSpawnMode(1)
    })

    return {getSpawnMode, setSpawnMode, cycleSpawnMode}
}
