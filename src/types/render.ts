import type {PerspectiveCamera, Scene, WebGLRenderer} from "three";

/** Three.js 渲染上下文 */
export interface RenderContext {
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
}
