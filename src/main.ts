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

const {scene, camera, renderer} = createRenderContext(app)
addGridHelper(scene)
setupMouseOrbit(camera, renderer.domElement)

const physics = setupPhysicsWorld(scene)
const keyboardUpdate = setupKeyboardCamera(camera)
const cameraInfoUpdate = setupCameraInfo(camera)
const panel = setupBoxControlPanel(physics)
setupPointerInteraction(camera, renderer, physics, panel)

let lastTime = performance.now()

function tick(time: number): void {
    requestAnimationFrame(tick)
    const delta = Math.min((time - lastTime) / 1000, MAX_DT)
    lastTime = time

    physics.step(delta)
    physics.getBoxes().forEach(syncBodyToMesh)
    keyboardUpdate()
    cameraInfoUpdate()
    renderer.render(scene, camera)
}

tick(performance.now())
