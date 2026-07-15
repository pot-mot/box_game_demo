import './assets/style.css'
import {createRenderContext} from './render/setup.ts'
import {setupInfiniteGrid} from './render/grid.ts'
import {setupMouseOrbit} from './input/mouse_orbit.ts'
import {setupPhysicsWorld} from './physics/world.ts'
import {syncBodyToMesh} from './render/box.ts'
import {setupKeyboardCamera} from './input/keyboard_camera.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupElementPanel} from './ui/element_panel.ts'
import {setupBoxControlPanel} from './ui/box_panel.ts'
import {setupPointerInteraction} from './input/pointer_interaction.ts'
import {MAX_DT} from './physics/constants.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

// --- 渲染系统 ---
const {scene, camera, renderer} = createRenderContext(app)

// --- 无限地面网格（跟随摄像机，半径 64 内有效） ---
const gridUpdate = setupInfiniteGrid(scene, camera)

// --- 输入系统 ---
setupMouseOrbit(camera, renderer.domElement)

// --- 物理系统 ---
const physics = setupPhysicsWorld(scene)

// --- 控制系统（每帧 updater） ---
const keyboardUpdate = setupKeyboardCamera(camera)
const cameraInfoUpdate = setupCameraInfo(camera)

// --- UI 面板 + 指针交互 ---
const panel = setupBoxControlPanel(physics)
setupPointerInteraction(camera, renderer, physics, panel)
const elementPanelUpdate = setupElementPanel(physics, panel)

// --- 单 RAF 循环：协调所有子系统 ---
let lastTime = performance.now()

const tick = (time: number): void => {
    requestAnimationFrame(tick)
    // 计算帧间隔，防止卡顿时 delta 过大
    const delta = Math.min((time - lastTime) / 1000, MAX_DT)
    lastTime = time

    physics.step(delta)                         // 1. 步进物理世界
    physics.getBoxes().forEach(syncBodyToMesh)  // 2. 同步 body → mesh
    gridUpdate()                                // 3. 网格跟随摄像机
    keyboardUpdate()                            // 4. 键盘移动相机
    cameraInfoUpdate()                          // 5. 更新 HUD
    elementPanelUpdate()                        // 6. 更新元素列表
    renderer.render(scene, camera)              // 7. 渲染场景
}

tick(performance.now())
