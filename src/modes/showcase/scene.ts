import {Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Color} from 'three'
import type {WebGLRenderer} from 'three'
import {setupInfiniteGrid} from '../../render/grid.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
import {createCameraControl, type CameraControl} from '../control/camera_control.ts'
import {CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, SCENE_BACKGROUND} from './constants.ts'

/** 展示舞台基础件：独立场景 + 相机 + 灯光 + 无限网格 + 释放信号（不含相机控制，供玩家主控模块自持相机） */
export interface ShowcaseStage {
    readonly scene: Scene
    readonly camera: PerspectiveCamera
    /** 每帧调用：无限网格跟随相机（复用主场景 grid.ts） */
    readonly followGrid: () => void
    /** 释放窗口级监听（resize） */
    readonly signal: AbortSignal
    readonly dispose: () => void
}

export interface ShowcaseScene extends ShowcaseStage {
    readonly orbit: CameraControl
}

/**
 * 展示舞台：自建独立 Three 场景 + 灯光（参数与 render/setup.ts 一致）+ 无限网格地面，
 * 复用主页共享渲染器（同一 WebGL 上下文，不自启第二个渲染循环）。
 * 角色全部面向 +Z，默认相机位于 +Z 侧上方，即从正面观察攻击动作。
 */
export const setupShowcaseStage = (renderer: WebGLRenderer): ShowcaseStage => {
    const scene = new Scene()
    scene.background = new Color(SCENE_BACKGROUND)

    const camera = new PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, CAMERA_NEAR, CAMERA_FAR)
    /* 提升展示场景清晰度（共享渲染器默认 DPR=1；退出时渲染器随宿主销毁，不影响其他模式） */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    /* 灯光：主光 + 补光 + 环境光（与主游戏 render/setup.ts 同参数，保证材质观感一致） */
    scene.add(new AmbientLight(0xffffff, 0.6))
    const dirLight = new DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(10, 15, 10)
    scene.add(dirLight)
    const fillLight = new DirectionalLight(0xffffff, 0.3)
    fillLight.position.set(-5, 5, -5)
    scene.add(fillLight)

    /* 复用主场景的无限网格地面 */
    const followGrid = setupInfiniteGrid(scene, camera)

    /* 所有监听由 AbortController 统一管理，dispose 一次释放 */
    const events = new AbortController()

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
    }, {signal: events.signal})

    const dispose = (): void => {
        events.abort()
    }

    return {scene, camera, followGrid, signal: events.signal, dispose}
}

/**
 * 展示场景：舞台 + **纯摄像机**控制器（`modes/control/camera_control.ts`），供相机类子模块使用。
 *
 * `keyboardFreeFlight` 控制 WASDZX 是否驱动相机自由飞行（缺省 true）；需要 WASD 驱动玩家的子模块
 * 应改用 `setupShowcaseStage` 并配合 `modes/control/player_control.ts`。
 */
export const setupShowcaseScene = (renderer: WebGLRenderer, keyboardFreeFlight = true): ShowcaseScene => {
    const stage = setupShowcaseStage(renderer)
    const orbit = createCameraControl(stage.camera, renderer.domElement, {
        pointerActions: MOUSE_ACTIONS_BY_MODE.showcase,
        keyboardFreeFlight,
        panEnabled: true,
        zoomEnabled: true,
        signal: stage.signal,
    })
    orbit.update(0)
    return {...stage, orbit}
}
