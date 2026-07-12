import {Scene, PerspectiveCamera, WebGLRenderer} from 'three'
import type {RenderContext} from '../types/render.ts'

const SENSITIVITY = 0.002

export const setupRenderer = (parent: HTMLElement): RenderContext => {
    const scene = new Scene()
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.y = 2
    camera.rotation.order = 'YXZ'

    const renderer = new WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    parent.appendChild(renderer.domElement)

    const ctx: RenderContext = {scene, camera, renderer}

    let yaw = 0
    let pitch = 0
    let isDown = false

    renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0) isDown = true
    })
    window.addEventListener('mouseup', () => {
        isDown = false
    })
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return
        yaw -= e.movementX * SENSITIVITY
        pitch -= e.movementY * SENSITIVITY
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
        camera.rotation.y = yaw
        camera.rotation.x = pitch
    })

    return ctx
}
