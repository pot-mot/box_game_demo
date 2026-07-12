import './assets/style.css'
import { setupBox } from './components/box.ts'
import { setupCameraInfoPanel } from './components/camera_info_panel.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

const { camera } = setupBox(app)
setupCameraInfoPanel(camera)
