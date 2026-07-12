import './assets/style.css'
import {createRenderContext, addGridHelper} from './render/setup.ts'
import {setupMouseOrbit} from './input/mouse_orbit.ts'
import {setupPhysicsWorld} from './physics/world.ts'
import {syncBodyToMesh} from './render/box.ts'
import {setupKeyboardCamera} from './input/keyboard_camera.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupBoxControlPanel} from './ui/box_panel.ts'
import {setupPointerInteraction} from './input/pointer_interaction.ts'
import {MAX_DT} from './physics/constants.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

// --- 渲染系统 ---
const {scene, camera, renderer} = createRenderContext(app)
addGridHelper(scene)

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

// --- 单 RAF 循环：协调所有子系统 ---
let lastTime = performance.now()

function tick(time: number): void {
    requestAnimationFrame(tick)
    // 计算帧间隔，防止卡顿时 delta 过大
    const delta = Math.min((time - lastTime) / 1000, MAX_DT)
    lastTime = time

    physics.step(delta)                         // 1. 步进物理世界
    physics.getBoxes().forEach(syncBodyToMesh)  // 2. 同步 body → mesh
    keyboardUpdate()                            // 3. 键盘移动相机
    cameraInfoUpdate()                          // 4. 更新 HUD
    renderer.render(scene, camera)              // 5. 渲染场景
}

tick(performance.now())
