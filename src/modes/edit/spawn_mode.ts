import {type SpawnMode} from '../../types/spawnMode.ts'
import {getInputRegistry} from '../../input/registry.ts'

const SPAWN_MODES: SpawnMode[] = [
    'box/common', 'box/destruction', 'box/burning', 'box/magnet', 'box/elasticity',
    'area/water',
    'character',
    'terrain',
]

export const setupSpawnModeManager = (): {
    getSpawnMode: () => SpawnMode
    setSpawnMode: (mode: SpawnMode) => void
    cycleSpawnMode: (direction: -1 | 1) => void
} => {
    const input = getInputRegistry()
    let index = 0

    const getSpawnMode = (): SpawnMode => SPAWN_MODES[index]

    const setSpawnMode = (mode: SpawnMode): void => {
        index = SPAWN_MODES.indexOf(mode)
    }

    const cycleSpawnMode = (direction: -1 | 1): void => {
        index = (index + direction + SPAWN_MODES.length) % SPAWN_MODES.length
    }

    input.onActionDown('cycle_spawn_up', () => cycleSpawnMode(-1))
    input.onActionDown('cycle_spawn_down', () => cycleSpawnMode(1))

    return {getSpawnMode, setSpawnMode, cycleSpawnMode}
}
