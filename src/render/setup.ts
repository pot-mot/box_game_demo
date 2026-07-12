import {Scene, PerspectiveCamera, WebGLRenderer, GridHelper} from 'three'
import type {RenderContext} from '../types/render.ts'
import {
    FOV, NEAR, FAR, CAMERA_Y,
    GRID_SIZE, GRID_DIVISIONS, GRID_CENTER_COLOR, GRID_LINE_COLOR,
} from './constants.ts'

export function createRenderContext(parent: HTMLElement): RenderContext {
    const scene = new Scene()
    const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR, FAR)
    camera.position.y = CAMERA_Y
    camera.rotation.order = 'YXZ'
    const renderer = new WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    parent.appendChild(renderer.domElement)
    return {scene, camera, renderer}
}

export function addGridHelper(scene: Scene): void {
    const grid = new GridHelper(GRID_SIZE, GRID_DIVISIONS, GRID_CENTER_COLOR, GRID_LINE_COLOR)
    grid.position.y = 0
    scene.add(grid)
}
