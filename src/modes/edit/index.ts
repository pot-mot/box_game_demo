import {type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {SpawnMode} from '../../types/spawnMode.ts'
import {setupMouseOrbit} from './camera.ts'
import {setupKeyboardCamera} from './keyboard.ts'
import {setupSpawnModeManager} from './spawn_mode.ts'
import {setupPointerInteraction} from './pointer_interaction.ts'
import {setupSpawnModePanel} from '../../ui/spawn_mode_panel.ts'
import {setupElementListPanel} from '../../ui/element_list_panel.ts'

export interface EditModeController {
    updater: () => void
    setCameraOrientation: (yaw: number, pitch: number) => void
    spawnMode: {
        getSpawnMode: () => SpawnMode
        setSpawnMode: (mode: SpawnMode) => void
    }
}

export const setupEditMode = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    systems: EntityInfoSource[],
    terrainSources: TerrainContext[],
    terrainSource: TerrainContext,
): EditModeController => {
    // 初始地形
    terrainSource.spawnAt(0, 0, 0)

    // 编辑控制
    const orbit = setupMouseOrbit(camera, renderer.domElement)
    const keyboardCamera = setupKeyboardCamera(camera)
    const spawnMode = setupSpawnModeManager()
    setupPointerInteraction(camera, renderer, systems, spawnMode.getSpawnMode, terrainSources)

    keyboardCamera.setEnabled(true)

    // UI 面板
    const spawnModePanelUpdate = setupSpawnModePanel(spawnMode.getSpawnMode, spawnMode.setSpawnMode)
    const elementListPanelUpdate = setupElementListPanel(systems)

    const updater = (): void => {
        keyboardCamera.updater()
        spawnModePanelUpdate()
        elementListPanelUpdate()
    }

    return {
        updater,
        setCameraOrientation: (yaw: number, pitch: number) => { orbit.setOrientation(yaw, pitch) },
        spawnMode: {
            getSpawnMode: spawnMode.getSpawnMode,
            setSpawnMode: spawnMode.setSpawnMode,
        },
    }
}
