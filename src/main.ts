import './assets/style.css'
import {type Mesh} from 'three'
import type {EntityInfoSource} from './entity/box/base/types/entity_info.ts'
import type {EntityTickHandler} from './types/physics.ts'
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
import {setupWaterBlocks} from './entity/box/water/physics/world.ts'
import {setupBurningBoxes} from './entity/box/burning/physics/world.ts'
import {setupMagnetBoxes} from './entity/box/magnet/physics/world.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupSpawnModePanel} from './ui/spawn_mode_panel.ts'
import {setupElementListPanel} from './ui/element_list_panel.ts'
import {setupPointerInteraction} from './input/pointer_interaction.ts'
import {MAX_DT, FIXED_TIME_STEP, MAX_SUB_STEPS} from './physics/constants.ts'

type EntitySystem = EntityInfoSource & EntityTickHandler

const app = document.querySelector<HTMLDivElement>('#app')!

// --- 渲染系统 ---
const {scene, camera, renderer} = createRenderContext(app)
const renderFrame = setupRefractionPass(scene, camera, renderer)

// --- 无限地面网格 ---
const gridUpdate = setupInfiniteGrid(scene, camera)

// --- 输入系统 ---
setupMouseOrbit(camera, renderer.domElement)
const keyboardUpdate = setupKeyboardCamera(camera, renderer.domElement)
const spawnMode = setupSpawnModeManager()

// --- 共享物理世界 ---
const shared = createSharedWorld()

// --- 物理环境（body 收集器）---
const physicsEnv = createPhysicsEnv()

// --- Entity 子系统（按依赖顺序初始化）---
const fragments = setupFragmentEntities(scene, shared)
const common = setupCommonBoxes(scene, shared)
const destruction = setupDestructibleBoxes(scene, shared, fragments)
const water = setupWaterBlocks(scene, physicsEnv)
const burning = setupBurningBoxes(scene, shared)
const magnet = setupMagnetBoxes(scene, shared, physicsEnv)

// 注册 body provider，供 water 浮力等跨系统逻辑使用
physicsEnv.bodyProviders.push(
    () => fragments.getAll().map(f => f.body),
    () => common.getAll().map(e => e.body),
    () => destruction.getAll().map(e => e.body),
    () => burning.getAll().map(e => e.body),
    () => magnet.getAll().map(e => e.body),
)

const systems: EntitySystem[] = [common, destruction, fragments, water, burning, magnet]

// --- 指针交互 + UI ---
setupPointerInteraction(camera, renderer, systems, spawnMode.getSpawnMode)
const cameraInfoUpdate = setupCameraInfo(camera)
const spawnModePanelUpdate = setupSpawnModePanel(spawnMode.getSpawnMode, spawnMode.setSpawnMode)
const elementListPanelUpdate = setupElementListPanel(systems)

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
        keyboardUpdate()

        // ── 双 Pass 渲染（水方块折射）──
        const waterMeshes: Mesh[] = water.getMeshes()
        renderFrame(waterMeshes)

        cameraInfoUpdate()
        spawnModePanelUpdate()
        elementListPanelUpdate()
    } catch (e) {
        console.warn('Frame update failed:', e)
    }

    requestAnimationFrame(tick)
}

tick(performance.now())
renderer.domElement.focus()
