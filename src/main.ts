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
import {setupMouseOrbit} from './input/mouse_orbit.ts'
import {setupSpawnModeManager} from './input/spawn_mode.ts'
import {setupKeyboardCamera} from './input/keyboard_camera.ts'
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
import {setupSpawnModePanel} from './ui/spawn_mode_panel.ts'
import {setupElementListPanel} from './ui/element_list_panel.ts'
import {setupPointerInteraction} from './input/pointer_interaction.ts'
import {setupStartupScreen} from './modes/startup_screen.ts'
import {setupInstructionsPanel} from './modes/instructions_panel.ts'
import {setupSettingsPanel} from './ui/settings_panel.ts'
import {setupPlayCamera} from './modes/play_camera.ts'
import {setupPlayer} from './entity/player/physics/world.ts'
import {setupPlayerInput} from './entity/player/input.ts'
import {collectWorldState, saveWorldToFile} from './save_load/serialize.ts'
import {loadWorldFromData, clearAllEntities} from './save_load/deserialize.ts'
import {MAX_DT, FIXED_TIME_STEP, MAX_SUB_STEPS} from './physics/constants.ts'

type EntitySystem = EntityInfoSource & EntityTickHandler

const app = document.querySelector<HTMLDivElement>('#app')!

// ── 启动页 ──

setupStartupScreen({
    onStart: (mode: GameMode, saveData?: SaveData) => {
        startGame(mode, saveData)
    },
})

/** 计算玩家安全出生 Y 坐标：取地形最高点 + 半身高 + 额外间隙 */
const getPlayerSpawnY = (terrains: readonly TerrainContext[]): number => {
    let maxH = 0 // 地面 Y
    for (const t of terrains) {
        const h = t.getHeightAt(0, 0, 1)
        if (h !== undefined && h > maxH) maxH = h
    }
    return maxH + 0.5 + 0.3 // 半高 0.5 + 余量 0.3
}

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

    // --- 输入系统（编辑模式）---
    const keyboardCamera = setupKeyboardCamera(camera, renderer.domElement)
    const spawnMode = setupSpawnModeManager()
    const pointerInteraction = setupPointerInteraction(
        camera, renderer, systems, spawnMode.getSpawnMode, allTerrainSources,
    )

    // --- UI ---
    const cameraInfoUpdate = setupCameraInfo(camera)
    const spawnModePanelUpdate = setupSpawnModePanel(spawnMode.getSpawnMode, spawnMode.setSpawnMode)
    const elementListPanelUpdate = setupElementListPanel(systems)
    const {updater: instructionsUpdate, toggle: toggleInstructions} = setupInstructionsPanel(() => mode)

    // --- 相机控制（分模式）---
    let playCameraUpdate: (() => void) | undefined

    if (mode === 'edit') {
        setupMouseOrbit(camera, renderer.domElement)
    } else {
        playCameraUpdate = setupPlayCamera(camera, renderer.domElement, () => {
            const p = player?.getPlayer()
            return p ? p.mesh.position : undefined
        })
    }

    // --- 游玩模式玩家（延迟初始化，见下文模式配置）---
    let player: ReturnType<typeof setupPlayer> | undefined
    let playerInput: (() => void) | undefined

    // --- 存档快捷键 ---
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            const state = collectWorldState(
                systemsByType,
                allTerrainSources,
                mode,
                player?.getPlayer()?.body.position,
            )
            saveWorldToFile(state)
        }
        if (e.code === 'KeyO' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.json'
            input.onchange = () => {
                const file = input.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                    try {
                        const raw = JSON.parse(reader.result as string) as unknown
                        import('./save_load/validation.ts').then(({validateSaveData}) => {
                            try {
                                const validated = validateSaveData(raw)
                                clearAllEntities(systemsByType, allTerrainSources)
                                const result = loadWorldFromData(validated, systemsByType, allTerrainSources)
                                // 若当前为 play 模式且保存中有玩家数据，重建玩家
                                if (mode === 'play' && result.playerPos) {
                                    if (!player) player = setupPlayer(scene, shared)
                                    player.remove()
                                    player.spawn(result.playerPos.x, result.playerPos.y, result.playerPos.z)
                                    playerInput = setupPlayerInput(camera, player, renderer.domElement)
                                }
                            } catch (err) {
                                console.warn('存档加载失败:', err)
                            }
                        })
                    } catch {
                        console.warn('文件解析失败')
                    }
                }
                reader.readAsText(file)
            }
            input.click()
        }
    })

    // --- 模式特定的配置 ---
    if (mode === 'edit') {
        // 编辑模式：初始化默认地形
        terrainSource.spawnAt(0, 0, 0)
        // 启用编辑交互
        pointerInteraction.setEnabled(true)
        keyboardCamera.setEnabled(true)
        player = undefined
    } else {
        // 游玩模式：创建玩家，禁用编辑交互
        pointerInteraction.setEnabled(false)
        keyboardCamera.setEnabled(false)
        player = setupPlayer(scene, shared)
        player.spawn(0, getPlayerSpawnY(allTerrainSources), 0)
        playerInput = setupPlayerInput(camera, player, renderer.domElement)
    }

    // --- 设置面板（右上角）---
    setupSettingsPanel(toggleInstructions)

    // --- 若导入了存档，覆盖默认地形/玩家 ---
    if (saveData) {
        clearAllEntities(systemsByType, allTerrainSources)
        const result = loadWorldFromData(saveData, systemsByType, allTerrainSources)
        if (mode === 'play' && result.playerPos && player) {
            player.remove()
            player.spawn(result.playerPos.x, result.playerPos.y, result.playerPos.z)
            playerInput = setupPlayerInput(camera, player, renderer.domElement)
        } else if (mode === 'play' && !player) {
            player = setupPlayer(scene, shared)
            const safeY = result.playerPos?.y ?? getPlayerSpawnY(allTerrainSources)
            player.spawn(result.playerPos?.x ?? 0, safeY, result.playerPos?.z ?? 0)
            playerInput = setupPlayerInput(camera, player, renderer.domElement)
        }
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

            // 玩家位置同步
            if (player) {
                player.syncPositions()
            }

            gridUpdate()
            keyboardCamera.updater()
            playerInput?.()

            // 双 Pass 渲染（水方块折射）
            const waterMeshes: Mesh[] = water.getMeshes()
            renderFrame(waterMeshes)

            playCameraUpdate?.()
            cameraInfoUpdate()
            if (mode === 'edit') {
                spawnModePanelUpdate()
                elementListPanelUpdate()
            }
            instructionsUpdate()
        } catch (e) {
            console.warn('Frame update failed:', e)
        }

        requestAnimationFrame(tick)
    }

    tick(performance.now())
    renderer.domElement.focus()
}
