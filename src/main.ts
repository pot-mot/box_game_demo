import './assets/style.css'
import {WebGLRenderTarget, ShaderMaterial} from 'three'
import {createRenderContext} from './render/setup.ts'
import {setupInfiniteGrid} from './render/grid.ts'
import {setupMouseOrbit} from './input/mouse_orbit.ts'
import {createSharedWorld} from './physics/world.ts'
import {setupCommonBoxes} from './entity/box/common/physics/world.ts'
import {setupDestructibleBoxes} from './entity/box/destructed/physics/world.ts'
import {setupFragmentEntities} from './entity/fragment/common/physics/world.ts'
import {setupWaterBlocks} from './entity/box/water/physics/world.ts'
import {setupWaterPhysics} from './entity/box/water/physics/forces.ts'
import {setupKeyboardCamera} from './input/keyboard_camera.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {setupElementListPanel} from './ui/element_list_panel.ts'
import {setupPointerInteraction, type SpawnMode} from './input/pointer_interaction.ts'
import {MAX_DT, FIXED_TIME_STEP, MAX_SUB_STEPS} from './physics/constants.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

// --- 渲染系统 ---
const {scene, camera, renderer} = createRenderContext(app)

// --- 折射背景渲染目标 ---
const backgroundRT = new WebGLRenderTarget(window.innerWidth, window.innerHeight)
window.addEventListener('resize', () => {
    backgroundRT.setSize(window.innerWidth, window.innerHeight)
})

// --- 无限地面网格 ---
const gridUpdate = setupInfiniteGrid(scene, camera)

// --- 输入系统 ---
setupMouseOrbit(camera, renderer.domElement)

// --- 共享物理世界 ---
const shared = createSharedWorld()

// --- 普通箱子子系统 ---
const common = setupCommonBoxes(scene, shared)

// --- 碎块子系统（需在 destructed 前初始化）---
const fragments = setupFragmentEntities(scene, shared)

// --- 可破坏箱子子系统 ---
const destruction = setupDestructibleBoxes(scene, shared, fragments)

// --- 水方块子系统 ---
const water = setupWaterBlocks(scene)
const waterPhysicsUpdate = setupWaterPhysics(
    () => [...common.getAll().map(e => e.body), ...destruction.getAll().map(e => e.body), ...fragments.getAll().map(f => f.body)],
    () => water.getAll().map(w => ({config: w.config, position: w.mesh.position})),
)

// --- 统一 entity 列表 ---
const sources = [common, destruction, fragments, water]

// --- Spawn mode (1=common, 2=destruction, 3=water) ---
let spawnMode: SpawnMode = 'box/common'
window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Digit1') spawnMode = 'box/common'
    if (e.code === 'Digit2') spawnMode = 'box/destruction'
    if (e.code === 'Digit3') spawnMode = 'box/water'
})

const getSpawnMode = (): SpawnMode => spawnMode

// --- 控制系统（每帧 updater） ---
const keyboardUpdate = setupKeyboardCamera(camera, renderer.domElement)
const cameraInfoUpdate = setupCameraInfo(camera, getSpawnMode)

// --- 指针交互 + 元素列表 ---
setupPointerInteraction(camera, renderer, sources, getSpawnMode)
const elementListPanelUpdate = setupElementListPanel(sources)

// --- 单 RAF 循环 ---
let lastTime = performance.now()

const tick = (time: number): void => {
    const delta = Math.min((time - lastTime) / 1000, MAX_DT)
    lastTime = time

    try {
        shared.world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS)    // 1. 步进物理世界
        destruction.updatePhysics(delta)         // 2. 伤害累计 → 破碎触发
        fragments.updatePhysics(delta)           // 3. 碎块生命周期递减
        waterPhysicsUpdate()                     // 4. 水方块浮力计算
        sources.forEach(s => s.syncPositions())  // 5. body→mesh + rowText 同步
        water.updateTime(time)                   // 6. 水面波浪动画
        gridUpdate()                            // 7. 网格跟随摄像机
        keyboardUpdate()                        // 8. 键盘移动相机

        // ── 双 Pass 渲染（Pass 1：背景到纹理，供折射使用）──
        const allWater = water.getAll()
        for (const wb of allWater) wb.mesh.visible = false
        renderer.setRenderTarget(backgroundRT)
        renderer.render(scene, camera)

        // ── Pass 2：最终场景到屏幕（含水）──
        for (const wb of allWater) {
            wb.mesh.visible = true
            const mat = wb.mesh.material as ShaderMaterial
            if (mat.uniforms.uRefractionTex) {
                mat.uniforms.uRefractionTex.value = backgroundRT.texture
                mat.uniforms.uViewportSize.value.set(window.innerWidth, window.innerHeight)
            }
        }
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)

        cameraInfoUpdate()                      // 9. 更新 HUD
        elementListPanelUpdate()                // 10. 更新元素列表
    } catch (e) {
        console.warn('Frame update failed:', e)
    }

    requestAnimationFrame(tick)
}

tick(performance.now())

renderer.domElement.focus()
