import './assets/style.css'
import {createRenderContext} from './render/setup.ts'
import {setupInfiniteGrid} from './render/grid.ts'
import {setupMouseOrbit} from './input/mouse_orbit.ts'
import {createSharedWorld} from './physics/world.ts'
import {setupCommonBoxes} from './common_box/physics/world.ts'
import {setupDestructibleBoxes} from './destruction_box/physics/world.ts'
import {syncBodyToMesh as syncCommon} from './common_box/render/box.ts'
import {syncDestructibleBodyToMesh, syncDebrisToMesh} from './destruction_box/render/box.ts'
import {setupKeyboardCamera} from './input/keyboard_camera.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupElementPanel} from './ui/element_panel.ts'
import {setupBoxControlPanel} from './ui/box_panel.ts'
import {setupDestructionPanel} from './ui/destruction_panel.ts'
import {setupPointerInteraction, type SpawnMode} from './input/pointer_interaction.ts'
import {setupWaterBlocks} from './water_block/world.ts'
import {setupWaterPhysics} from './water_block/physics.ts'
import {setupWaterPanel} from './ui/water_panel.ts'
import type {WaterBoxContext} from './water_block/types/water.ts'
import {MAX_DT, FIXED_TIME_STEP, MAX_SUB_STEPS} from './physics/constants.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

// --- 渲染系统 ---
const {scene, camera, renderer} = createRenderContext(app)

// --- 无限地面网格 ---
const gridUpdate = setupInfiniteGrid(scene, camera)

// --- 输入系统 ---
setupMouseOrbit(camera, renderer.domElement)

// --- 共享物理世界 ---
const shared = createSharedWorld()

// --- 普通箱子子系统 ---
const common = setupCommonBoxes(scene, shared)

// --- 可破坏箱子子系统 ---
const destruction = setupDestructibleBoxes(scene, shared)

// --- 水方块子系统 ---
const waterBlocks: WaterBoxContext = setupWaterBlocks(scene)
const waterPhysicsUpdate = setupWaterPhysics(common, destruction, () => waterBlocks.getBlocks())
const waterPanel = setupWaterPanel(waterBlocks)

// --- Spawn mode (1=common, 2=destruction, 3=water) ---
let spawnMode: SpawnMode = 'common'
window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Digit1') spawnMode = 'common'
    if (e.code === 'Digit2') spawnMode = 'destruction'
    if (e.code === 'Digit3') spawnMode = 'water'
})

const getSpawnMode = (): SpawnMode => spawnMode

// --- 控制系统（每帧 updater） ---
const keyboardUpdate = setupKeyboardCamera(camera, renderer.domElement)
const cameraInfoUpdate = setupCameraInfo(camera, getSpawnMode)

// --- UI 面板 + 指针交互 ---
const commonPanel = setupBoxControlPanel(common)
const destructionPanel = setupDestructionPanel(destruction)
setupPointerInteraction(camera, renderer, common, commonPanel, destruction, destructionPanel, waterBlocks, waterPanel, getSpawnMode)
const elementPanelUpdate = setupElementPanel(common, commonPanel, destruction, destructionPanel, waterBlocks, waterPanel)

// --- 单 RAF 循环 ---
let lastTime = performance.now()

const tick = (time: number): void => {
    const delta = Math.min((time - lastTime) / 1000, MAX_DT)
    lastTime = time

    try {
        shared.world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS)    // 1. 步进物理世界
        destruction.update(delta)                // 2. 伤害累计 + 破碎触发
        waterPhysicsUpdate()                     // 3. 水方块浮力计算
        common.getBoxes().forEach(syncCommon)   // 4. common box 同步
        destruction.getBoxes().forEach(syncDestructibleBodyToMesh) // 5. destruction box 同步
        destruction.getDebris().forEach(syncDebrisToMesh)           // 6. 碎片同步
        waterBlocks.update(time)                 // 7. 水面波浪动画
        gridUpdate()                            // 8. 网格跟随摄像机
        keyboardUpdate()                        // 9. 键盘移动相机
        cameraInfoUpdate()                      // 10. 更新 HUD
        elementPanelUpdate()                    // 11. 更新元素列表
        renderer.render(scene, camera)          // 12. 渲染场景
    } catch (e) {
        console.warn('Frame update failed:', e)
    }

    requestAnimationFrame(tick)
}

tick(performance.now())

renderer.domElement.focus()
