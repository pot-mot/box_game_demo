import './assets/style.css'
import { setupBox } from './components/box.ts'
import { setupCameraInfoPanel } from './components/camera_info_panel.ts'
import { setupPhysicsWorld } from './components/physics_world.ts'
import { setupBoxControlPanel } from './components/box_control_panel.ts'
import { setupBoxInteraction } from './components/box_interaction.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

const { scene, camera, renderer } = setupBox(app)
setupCameraInfoPanel(camera)
const physics = setupPhysicsWorld(scene, camera, renderer)
const panel = setupBoxControlPanel(physics)
setupBoxInteraction(camera, renderer, physics, panel)
