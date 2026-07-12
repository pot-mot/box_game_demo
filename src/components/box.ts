import { Scene, PerspectiveCamera, WebGLRenderer, BoxGeometry, MeshBasicMaterial, Mesh } from 'three'
import type {BoxContext} from "../types/context.ts";

const SENSITIVITY = 0.002

export const setupBox = (parent: HTMLElement): BoxContext => {
    const scene = new Scene()
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.z = 5
    camera.rotation.order = 'YXZ'

    const renderer = new WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    parent.appendChild(renderer.domElement)

    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial({ color: 0x888888 })
    const cube = new Mesh(geometry, material)
    scene.add(cube)

    const ctx: BoxContext = { scene, camera, renderer }

    let yaw = 0
    let pitch = 0
    let isDown = false

    renderer.domElement.addEventListener('mousedown', () => { isDown = true })
    window.addEventListener('mouseup', () => { isDown = false })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        yaw -= e.movementX * SENSITIVITY
        pitch -= e.movementY * SENSITIVITY
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
        camera.rotation.y = yaw
        camera.rotation.x = pitch
    })

    const animate = () => {
        requestAnimationFrame(animate)
        renderer.render(scene, camera)
    }

    animate()

    return ctx
}
