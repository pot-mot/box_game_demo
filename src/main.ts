import './assets/style.css'
import { setupRenderer } from './components/renderer.ts'
import { setupCameraInfoPanel } from './components/camera_info_panel.ts'
import { setupPhysicsWorld } from './components/physics_world.ts'
import { setupBoxControlPanel } from './components/box_control_panel.ts'
import { setupBoxInteraction } from './components/box_interaction.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

const { scene, camera, renderer } = setupRenderer(app)
setupCameraInfoPanel(camera)
const physics = setupPhysicsWorld(scene, camera, renderer)
const panel = setupBoxControlPanel(physics)
setupBoxInteraction(camera, renderer, physics, panel)
