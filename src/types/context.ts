import type {PerspectiveCamera, Scene, WebGLRenderer} from "three";

export interface BoxContext {
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
}
