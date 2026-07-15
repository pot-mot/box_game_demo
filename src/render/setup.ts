import {Scene, PerspectiveCamera, WebGLRenderer} from 'three'
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
    parent.appendChild(renderer.domElement)
    return {scene, camera, renderer}
}


