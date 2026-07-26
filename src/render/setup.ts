import {Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight} from 'three'
import type {RenderContext} from '../types/render.ts'
import {
    FOV, NEAR, FAR, CAMERA_Y,
} from './constants.ts'

/** 创建 Three.js 场景、相机、渲染器 */
export const createRenderContext = (parent: HTMLElement): RenderContext => {
    const scene = new Scene()
    const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR, FAR)
    camera.position.y = CAMERA_Y
    camera.rotation.order = 'YXZ' // 先偏航、后俯仰，避免万向锁
    const renderer = new WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.domElement.tabIndex = 0
    renderer.domElement.style.outline = 'none'
    parent.appendChild(renderer.domElement)

    // 光照（供 MeshStandardMaterial 使用）
    scene.add(new AmbientLight(0xffffff, 0.6))
    const dirLight = new DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(10, 15, 10)
    scene.add(dirLight)
    const fillLight = new DirectionalLight(0xffffff, 0.3)
    fillLight.position.set(-5, 5, -5)
    scene.add(fillLight)

    return {scene, camera, renderer}
}


