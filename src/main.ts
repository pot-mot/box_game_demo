import './assets/style.css'
import {createRenderContext} from './render/setup.ts'
import {setupInfiniteGrid} from './render/grid.ts'
import {setupMouseOrbit} from './input/mouse_orbit.ts'
import {createSharedWorld} from './physics/world.ts'
import {setupCommonBoxes} from './entity/box/common/physics/world.ts'
import {setupDestructibleBoxes} from './entity/box/destructed/physics/world.ts'
import {setupWaterBlocks} from './entity/box/water/physics/world.ts'
import {setupWaterPhysics} from './entity/box/water/physics/forces.ts'
import {syncBodyToMesh} from './entity/box/base/render'
import {syncDebrisToMesh} from './entity/box/destructed/render'
import {setupKeyboardCamera} from './input/keyboard_camera.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupElementPanel} from './ui/element_panel.ts'
import {setupPointerInteraction, type SpawnMode} from './input/pointer_interaction.ts'
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
const water = setupWaterBlocks(scene)
const waterPhysicsUpdate = setupWaterPhysics(
    () => [...common.getAll().map(e => e.body), ...destruction.getAll().map(e => e.body), ...destruction.getDebris().map(d => d.body)],
    () => water.getAll().map(w => ({config: w.config, position: w.mesh.position})),
)

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

// --- 指针交互 + 元素列表 ---
setupPointerInteraction(camera, renderer, common, destruction, water, getSpawnMode)
const elementPanelUpdate = setupElementPanel(common, destruction, water)

// --- 单 RAF 循环 ---
let lastTime = performance.now()

const tick = (time: number): void => {
    const delta = Math.min((time - lastTime) / 1000, MAX_DT)
    lastTime = time

    try {
        shared.world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS)    // 1. 步进物理世界
        destruction.updatePhysics(delta)         // 2. 伤害累计 + 破碎触发
        waterPhysicsUpdate()                     // 3. 水方块浮力计算
        common.getAll().forEach(e => syncBodyToMesh(e.mesh, e.body))   // 4. common box 同步
        destruction.getAll().forEach(e => syncBodyToMesh(e.mesh, e.body)) // 5. destruction box 同步
        destruction.getDebris().forEach(syncDebrisToMesh)            // 6. 碎片同步
        water.updateTime(time)                   // 7. 水面波浪动画
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
