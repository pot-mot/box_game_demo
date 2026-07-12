import type {PerspectiveCamera, Scene, WebGLRenderer} from "three";

export interface RenderContext {
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
}
