import './assets/style.css'
import {type Mesh} from 'three'
import type {EntityInfoSource} from './entity/box/base/types/entity_info.ts'
import type {EntityTickHandler} from './types/physics.ts'
import type {TerrainContext} from './entity/terrain/base/types'
import type {GameMode} from './modes/constants.ts'
import type {SaveData} from './save_load/types.ts'
import {createRenderContext} from './render/setup.ts'
import {setupInfiniteGrid} from './render/grid.ts'
import {setupRefractionPass} from './render/refraction_pass.ts'
import {createSharedWorld} from './physics/world.ts'
import {createPhysicsEnv} from './physics/env.ts'
import {setupCommonBoxes} from './entity/box/common/physics/world.ts'
import {setupDestructibleBoxes} from './entity/box/destructed/physics/world.ts'
import {setupFragmentEntities} from './entity/fragment/common/physics/world.ts'
import {setupWaterBlocks} from './entity/area/water/physics/world.ts'
import {setupBurningBoxes} from './entity/box/burning/physics/world.ts'
import {setupMagnetBoxes} from './entity/box/magnet/physics/world.ts'
import {setupElasticBoxes} from './entity/box/elasticity/physics/world.ts'
import {setupTerrain} from './entity/terrain/common/physics/world.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupStartupScreen} from './modes/startup_screen.ts'
import {setupInstructionsPanel} from './modes/instructions_panel.ts'
import {setupSettingsPanel} from './ui/settings_panel.ts'
import {setupEditMode} from './modes/edit'
import type {EditModeController} from './modes/edit'
import {setupPlayMode} from './modes/play'
import type {PlayModeController} from './modes/play'
import {collectWorldState, saveWorldToFile} from './save_load/serialize.ts'
import {loadWorldFromData, clearAllEntities, type LoadWorldResult} from './save_load/deserialize.ts'
import {cacheSaveData, loadCachedSaveData} from './save_load/cache.ts'
import {promptLoadFile} from './save_load/actions.ts'
import {MAX_DT, FIXED_TIME_STEP, MAX_SUB_STEPS} from './physics/constants.ts'

type EntitySystem = EntityInfoSource & EntityTickHandler

const app = document.querySelector<HTMLDivElement>('#app')!

// ── 启动页 ──

setupStartupScreen({
    onStart: (mode: GameMode, saveData?: SaveData) => {
        startGame(mode, saveData)
    },
})

const startGame = (mode: GameMode, saveData?: SaveData): void => {
    // --- 渲染系统 ---
    const {scene, camera, renderer} = createRenderContext(app)
    const renderFrame = setupRefractionPass(scene, camera, renderer)

    // --- 无限地面网格 ---
    const gridUpdate = setupInfiniteGrid(scene, camera)

    // --- 共享物理世界 ---
    const shared = createSharedWorld()
    const physicsEnv = createPhysicsEnv()

    // --- Entity 子系统（按依赖顺序初始化）---
    const fragments = setupFragmentEntities(scene, shared)
    const terrainSource = setupTerrain(scene, shared)
    const allTerrainSources: TerrainContext[] = [terrainSource]
    const common = setupCommonBoxes(scene, shared)
    const destruction = setupDestructibleBoxes(scene, shared, fragments)
    const water = setupWaterBlocks(scene, physicsEnv)
    const burning = setupBurningBoxes(scene, shared)
    const magnet = setupMagnetBoxes(scene, shared, physicsEnv)
    const elastic = setupElasticBoxes(scene, shared)

    // 注册 body provider
    physicsEnv.bodyProviders.push(
        () => fragments.getAll().map(f => f.body),
        () => common.getAll().map(e => e.body),
        () => destruction.getAll().map(e => e.body),
        () => burning.getAll().map(e => e.body),
        () => magnet.getAll().map(e => e.body),
        () => elastic.getAll().map(e => e.body),
        () => terrainSource.getAll().map(e => e.body),
    )

    // 按 type 索引
    const systems: EntitySystem[] = [common, destruction, fragments, water, burning, magnet, elastic, terrainSource]
    const systemsByType = new Map<string, EntityInfoSource>(
        systems.map(s => [s.type, s]),
    )

    // --- 模式控制器（编辑/游玩）---
    let editMode: EditModeController | undefined
    let playMode: PlayModeController | undefined

    if (mode === 'edit') {
        editMode = setupEditMode(camera, renderer, systems, allTerrainSources, terrainSource)
    } else {
        playMode = setupPlayMode(scene, camera, renderer, shared, allTerrainSources)
    }

    // --- UI ---
    const cameraInfoUpdate = setupCameraInfo(camera)
    const {updater: instructionsUpdate, toggle: toggleInstructions} = setupInstructionsPanel(() => mode)

    // --- 存档加载后恢复相机/玩家位置的辅助函数 ---
    const applyLoadResult = (result: LoadWorldResult): void => {
        if (mode === 'edit') {
            if (result.editCameraPos) camera.position.set(result.editCameraPos.x, result.editCameraPos.y, result.editCameraPos.z)
            if (result.editCameraRot) {
                camera.rotation.set(result.editCameraRot.x, result.editCameraRot.y, result.editCameraRot.z)
                editMode?.setCameraOrientation(camera.rotation.y, camera.rotation.x)
            }
        }
        if (mode === 'play') {
            if (result.playCameraPos) camera.position.set(result.playCameraPos.x, result.playCameraPos.y, result.playCameraPos.z)
            if (result.playCameraRot) camera.rotation.set(result.playCameraRot.x, result.playCameraRot.y, result.playCameraRot.z)
            if (result.playPlayerPos) {
                playMode?.respawnPlayer(result.playPlayerPos.x, result.playPlayerPos.y, result.playPlayerPos.z)
            }
        }
    }

    // --- 存档快捷键 ---
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            const cached = loadCachedSaveData()
            const state = collectWorldState(
                systemsByType,
                allTerrainSources,
                mode,
                camera.position,
                camera.rotation,
                playMode?.getPlayerBodyPosition(),
                cached?.modeInfo,
            )
            cacheSaveData(state)
            saveWorldToFile(state)
        }
        if (e.code === 'KeyO' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            promptLoadFile((data) => {
                cacheSaveData(data)
                clearAllEntities(systemsByType, allTerrainSources)
                const result = loadWorldFromData(data, systemsByType, allTerrainSources)
                applyLoadResult(result)
            })
        }
    })

    // --- 设置面板（右上角）---
    setupSettingsPanel(toggleInstructions)

    // --- 若导入了存档，覆盖默认地形/玩家/相机 ---
    if (saveData) {
        clearAllEntities(systemsByType, allTerrainSources)
        const result = loadWorldFromData(saveData, systemsByType, allTerrainSources)
        applyLoadResult(result)
    }

    // --- 单 RAF 循环 ---
    let lastTime = performance.now()

    const tick = (time: number): void => {
        const delta = Math.min((time - lastTime) / 1000, MAX_DT)
        lastTime = time

        try {
            shared.world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS)

            for (const s of systems) s.preSync?.(delta, time)
            for (const s of systems) s.syncPositions()

            gridUpdate()

            if (mode === 'edit') {
                editMode?.updater(delta)
            } else {
                playMode?.updater(delta)
            }

            // 双 Pass 渲染（水方块折射）
            const waterMeshes: Mesh[] = water.getMeshes()
            renderFrame(waterMeshes)

            cameraInfoUpdate()
            instructionsUpdate()
        } catch (e) {
            console.warn('Frame update failed:', e)
        }

        requestAnimationFrame(tick)
    }

    tick(performance.now())
    renderer.domElement.focus()
}
