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
import {setupCharacterEntities} from './entity/character/physics/world.ts'
import type {CharacterEntitySystem} from './entity/character/physics/world.ts'
import type {CharacterEntity} from './character/types.ts'
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
import {createInputRegistry} from './input/registry.ts'
import {openBindingPanel} from './input/binding_panel.ts'

type EntitySystem = EntityInfoSource & EntityTickHandler

const app = document.querySelector<HTMLDivElement>('#app')!

// ── 启动页 ──

setupStartupScreen({
    onStart: (mode: GameMode, saveData?: SaveData) => {
        startGame(mode, saveData)
    },
})

const startGame = (mode: GameMode, saveData?: SaveData): void => {
    // --- 输入注册表（必须在所有模式初始化之前）---
    const input = createInputRegistry()

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
    const characterSystem: CharacterEntitySystem = setupCharacterEntities(scene, shared)
    const common = setupCommonBoxes(scene, shared)
    const destruction = setupDestructibleBoxes(scene, shared, fragments)
    const water = setupWaterBlocks(scene, physicsEnv)
    const burning = setupBurningBoxes(scene, shared)
    const magnet = setupMagnetBoxes(scene, shared, physicsEnv)
    const elastic = setupElasticBoxes(scene, shared)

    // 注册 body provider
    physicsEnv.bodyProviders.push(
        () => fragments.getAll().map(f => f.body),
        () => characterSystem.getAll().map((e: CharacterEntity) => e.body),
        () => common.getAll().map(e => e.body),
        () => destruction.getAll().map(e => e.body),
        () => burning.getAll().map(e => e.body),
        () => magnet.getAll().map(e => e.body),
        () => elastic.getAll().map(e => e.body),
        () => terrainSource.getAll().map(e => e.body),
    )

    // 按 type 索引
    const systems: EntitySystem[] = [common, destruction, fragments, water, burning, magnet, elastic, characterSystem as EntitySystem, terrainSource]
    const systemsByType = new Map<string, EntityInfoSource>(
        systems.map(s => [s.type, s]),
    )

    characterSystem.setupLineOfSight(systems)

    /* 箱子生成回调（供 builder AI 使用） */
    const boxSpawner = (entry: {entityType: string; mass: number; friction: number; maxHealth?: number; attractionRadius?: number; attractionStrength?: number; stiffness?: number; dampingRatio?: number; maxDeformFraction?: number}, x: number, y: number, z: number, size: {width: number; height: number; depth: number}): void => {
        const mass = entry.mass * size.width * size.height * size.depth
        switch (entry.entityType) {
            case 'box/common':
                common.add({...size, mass, friction: entry.friction}, x, y, z)
                break
            case 'box/destruction':
                destruction.add({
                    ...size, mass, friction: entry.friction,
                    maxHealth: entry.maxHealth ?? 10,
                }, x, y, z)
                break
            case 'box/burning':
                burning.add({
                    ...size, mass, friction: entry.friction,
                    maxHealth: entry.maxHealth ?? 10,
                }, x, y, z)
                break
            case 'box/magnet':
                magnet.add({
                    ...size, mass, friction: entry.friction,
                    attractionRadius: entry.attractionRadius ?? 5,
                    attractionStrength: entry.attractionStrength ?? 10,
                }, x, y, z)
                break
            case 'box/elasticity':
                elastic.add({
                    ...size, mass, friction: entry.friction,
                    stiffness: entry.stiffness ?? 100,
                    dampingRatio: entry.dampingRatio ?? 0.3,
                    maxDeformFraction: entry.maxDeformFraction ?? 0.2,
                }, x, y, z)
                break
        }
    }

    characterSystem.registerBoxSpawner(boxSpawner)

    // --- 从缓存/导入文件加载实体（必须在 mode setup 之前，确保角色存在后再激活 AI）---
    const dataToLoad = saveData ?? loadCachedSaveData()
    let loadResult: LoadWorldResult | undefined
    if (dataToLoad) {
        clearAllEntities(systemsByType, allTerrainSources)
        loadResult = loadWorldFromData(dataToLoad, systemsByType, allTerrainSources)
    }

    // --- 模式控制器（编辑/游玩）---
    let editMode: EditModeController | undefined
    let playMode: PlayModeController | undefined

    if (mode === 'edit') {
        editMode = setupEditMode(camera, renderer, systems, allTerrainSources, terrainSource)
    } else {
        playMode = setupPlayMode(scene, camera, renderer, shared, allTerrainSources, characterSystem, boxSpawner)
    }

    /* ── 编辑模式：执行 / 步进状态 ── */
    let executing = false
    let snapshot: SaveData | undefined
    let aiActive = false

    const saveSnapshot = (): void => {
        snapshot = collectWorldState(
            systemsByType,
            allTerrainSources,
            'edit',
            camera.position,
            camera.rotation,
        )
    }

    const restoreSnapshot = (): void => {
        if (!snapshot) return
        clearAllEntities(systemsByType, allTerrainSources)
        loadWorldFromData(snapshot, systemsByType, allTerrainSources)
        saveSnapshot()
    }

    const ensureAI = (): void => {
        const shouldRun = executing || (editMode?.execute.pendingSteps() ?? 0) > 0
        if (shouldRun && !aiActive) {
            characterSystem.setAIEnabled(true)
            characterSystem.activateAI()
            aiActive = true
        } else if (!shouldRun && aiActive) {
            characterSystem.setAIEnabled(false)
            aiActive = false
        }
    }

    if (editMode) {
        editMode.execute.onToggle((entering: boolean) => {
            if (entering) {
                saveSnapshot()
                executing = true
            } else {
                executing = false
                restoreSnapshot()
            }
        })

        editMode.execute.onReset(() => {
            executing = false
            characterSystem.setAIEnabled(false)
            aiActive = false
            restoreSnapshot()
        })
    }

    /* 进入编辑模式时保存初始快照，保证始终至少有一个快照 */
    if (mode === 'edit') saveSnapshot()

    characterSystem.setCollisionVisible(mode === 'edit')

    // --- 恢复相机 ---
    if (loadResult) {
        if (mode === 'edit') {
            if (loadResult.editCameraPos) camera.position.set(loadResult.editCameraPos.x, loadResult.editCameraPos.y, loadResult.editCameraPos.z)
            if (loadResult.editCameraRot) {
                camera.rotation.set(loadResult.editCameraRot.x, loadResult.editCameraRot.y, loadResult.editCameraRot.z)
                editMode?.setCameraOrientation(camera.rotation.y, camera.rotation.x)
            }
        }
        if (mode === 'play') {
            if (loadResult.playCameraPos) camera.position.set(loadResult.playCameraPos.x, loadResult.playCameraPos.y, loadResult.playCameraPos.z)
            if (loadResult.playCameraRot) camera.rotation.set(loadResult.playCameraRot.x, loadResult.playCameraRot.y, loadResult.playCameraRot.z)
        }
    }

    // --- UI ---
    const cameraInfoUpdate = setupCameraInfo(camera)
    const {updater: instructionsUpdate, toggle: toggleInstructions} = setupInstructionsPanel(() => mode)

    // --- 存档快捷键 ---
    input.onActionDown('save_world', () => {
        const cached = loadCachedSaveData()
        const state = collectWorldState(
            systemsByType,
            allTerrainSources,
            mode,
            camera.position,
            camera.rotation,
            cached?.modeInfo,
        )
        cacheSaveData(state)
        saveWorldToFile(state)
    })

    input.onActionDown('load_world', () => {
        promptLoadFile((data) => {
            cacheSaveData(data)
            clearAllEntities(systemsByType, allTerrainSources)
            const result = loadWorldFromData(data, systemsByType, allTerrainSources)
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
            }
        })
    })

    // --- 设置面板（右上角）---
    setupSettingsPanel(toggleInstructions, openBindingPanel)

    // --- 单 RAF 循环 ---
    let lastTime = performance.now()

    const tick = (time: number): void => {
        const delta = Math.min((time - lastTime) / 1000, MAX_DT)
        lastTime = time

        try {
            const simActive = mode === 'play' || executing
            const pendingSteps = editMode?.execute.pendingSteps() ?? 0
            const stepActive = pendingSteps > 0 && !executing

            if (simActive) {
                /* play 模式或持续执行：正常变速步进 */
                shared.world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS)
                for (const s of systems) s.preSync?.(delta, time)
                for (const s of systems) s.syncPositions()
            } else if (stepActive) {
                /* 逐帧步进：每帧精确推进 1 物理步 */
                shared.world.step(FIXED_TIME_STEP, FIXED_TIME_STEP, 1)
                for (const s of systems) s.preSync?.(FIXED_TIME_STEP, time)
                for (const s of systems) s.syncPositions()
                editMode?.execute.consumeStep()
            }
            /* else: 编辑暂停态，物理世界完全冻结 */

            ensureAI()

            gridUpdate()

            if (mode === 'edit') {
                editMode?.updater(delta)
                if (simActive) {
                    characterSystem.update(delta)
                } else if (stepActive) {
                    characterSystem.update(FIXED_TIME_STEP)
                }
            } else {
                playMode?.updater(delta)
            }

            // 双 Pass 渲染（水方块折射）
            const waterMeshes: Mesh[] = water.getMeshes()
            renderFrame(waterMeshes)

            cameraInfoUpdate()
            instructionsUpdate()
            input.getUpdater()()
        } catch (e) {
            console.warn('Frame update failed:', e)
        }

        requestAnimationFrame(tick)
    }

    tick(performance.now())
    renderer.domElement.focus()
}
