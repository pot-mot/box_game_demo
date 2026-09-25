import {Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Color, Vector3} from 'three'
import type {WebGLRenderer} from 'three'
import {setupInfiniteGrid} from '../../render/grid.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {
    CAMERA_FAR,
    CAMERA_FOV,
    CAMERA_NEAR,
    ORBIT_DEFAULT_DISTANCE,
    ORBIT_DEFAULT_PITCH,
    ORBIT_DEFAULT_TARGET_Y,
    ORBIT_DEFAULT_TARGET_Z,
    ORBIT_DEFAULT_YAW,
    ORBIT_FOCUS_DISTANCE,
    ORBIT_FOCUS_LERP,
    FREE_PITCH_MAX,
    FREE_PITCH_MIN,
    ORBIT_MAX_DISTANCE,
    ORBIT_MIN_DISTANCE,
    ORBIT_PAN_SENSITIVITY,
    ORBIT_PITCH_MAX,
    ORBIT_PITCH_MIN,
    ORBIT_ROTATE_SENSITIVITY,
    ORBIT_WHEEL_SENSITIVITY,
    SCENE_BACKGROUND,
} from './constants.ts'

/**
 * 轨道相机：目标点 + 偏航/俯仰/距离球坐标，支持聚焦目标平滑过渡。
 * 滚轮缩放仅在自由视角下生效；聚焦期间（含进入/退出过渡）禁用，
 * 退出聚焦后回归进入前快照的目标点与距离。
 */
export interface OrbitCamera {
    readonly target: Vector3
    rotateBy: (dxPx: number, dyPx: number) => void
    panBy: (dxPx: number, dyPx: number) => void
    zoomBy: (wheelDelta: number) => void
    /** 聚焦到指定世界坐标（null = 取消聚焦并平滑回归进入前的自由视角） */
    focusTo: (position: Vector3 | null) => void
    /** 按 yaw 方向同步平移 target + camera（水平）或调整 target.y（垂直） */
    translateTargetBy: (dx: number, dy: number, dz: number) => void
    /** 返回当前偏航角（供键盘相机计算移动方向） */
    getYaw: () => number
    /** 每帧调用：执行聚焦插值并回写相机位姿 */
    update: (dt: number) => void
}

const defaultTarget = (): Vector3 => new Vector3(0, ORBIT_DEFAULT_TARGET_Y, ORBIT_DEFAULT_TARGET_Z)

const createOrbitCamera = (camera: PerspectiveCamera, domElement: HTMLElement, signal: AbortSignal): OrbitCamera => {
    const target = defaultTarget()
    let yaw = ORBIT_DEFAULT_YAW
    let pitch = ORBIT_DEFAULT_PITCH
    let distance = ORBIT_DEFAULT_DISTANCE

    /* 聚焦目标（非 null 时持续把 target/distance 拉向特写位）；returning = 取消聚焦后回归快照视角 */
    let focusPoint: Vector3 | null = null
    let returning = false
    /* 进入聚焦前的自由视角快照（退出聚焦时回归，保留用户调整的目标点与距离） */
    const savedTarget = defaultTarget()
    let savedDistance = ORBIT_DEFAULT_DISTANCE
    const returnTarget = defaultTarget()

    const applyCamera = (): void => {
        camera.position.set(
            target.x + distance * Math.cos(pitch) * Math.sin(yaw),
            target.y + distance * Math.sin(pitch),
            target.z + distance * Math.cos(pitch) * Math.cos(yaw),
        )
        camera.lookAt(target)
    }

    const rotateBy = (dxPx: number, dyPx: number): void => {
        if (focusPoint !== null) {
            /* 聚焦时：绕 target 轨道旋转（观察角色） */
            yaw -= dxPx * ORBIT_ROTATE_SENSITIVITY
            pitch += dyPx * ORBIT_ROTATE_SENSITIVITY
            pitch = Math.min(Math.max(pitch, ORBIT_PITCH_MIN), ORBIT_PITCH_MAX)
            return
        }
        /* 未聚焦：以相机自身为轴原地旋转（对标 edit 模式第一人称），
         * 保持 camera.position 不变，反向移动 target，使 applyCamera 回写后相机位置不变 */
        returning = false
        const camX = camera.position.x
        const camY = camera.position.y
        const camZ = camera.position.z
        yaw -= dxPx * ORBIT_ROTATE_SENSITIVITY
        pitch += dyPx * ORBIT_ROTATE_SENSITIVITY
        pitch = Math.min(Math.max(pitch, FREE_PITCH_MIN), FREE_PITCH_MAX)
        /* target = camera.position - offset(yaw, pitch)，视角方向随 yaw/pitch 改变而相机不动 */
        target.set(
            camX - distance * Math.cos(pitch) * Math.sin(yaw),
            camY - distance * Math.sin(pitch),
            camZ - distance * Math.cos(pitch) * Math.cos(yaw),
        )
    }

    const panBy = (dxPx: number, dyPx: number): void => {
        /* 聚焦锁定时禁用平移（避免与聚焦吸附互相拉扯） */
        if (focusPoint !== null) return
        returning = false
        /* 相机水平右向 / 前向（距离越远步幅越大），拖拽方向 = 场景移动方向 */
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)
        const fwdX = Math.sin(yaw)
        const fwdZ = Math.cos(yaw)
        const k = distance * ORBIT_PAN_SENSITIVITY
        target.x += (-dxPx * rightX - dyPx * fwdX) * k
        target.z += (-dxPx * rightZ - dyPx * fwdZ) * k
    }

    const zoomBy = (wheelDelta: number): void => {
        /* 聚焦期间与进入/退出过渡期间禁用滚轮缩放：
         * 保持自动取景距离不被干扰，退出聚焦后由回归插值恢复快照距离 */
        if (focusPoint !== null || returning) return
        distance = Math.min(
            Math.max(distance * Math.exp(wheelDelta * ORBIT_WHEEL_SENSITIVITY), ORBIT_MIN_DISTANCE),
            ORBIT_MAX_DISTANCE,
        )
    }

    const focusTo = (position: Vector3 | null): void => {
        if (position !== null) {
            /* 首次进入聚焦时快照当前自由视角（连续切换聚焦目标不覆盖快照） */
            if (focusPoint === null && !returning) {
                savedTarget.copy(target)
                savedDistance = distance
            }
            focusPoint = position.clone()
            returning = false
        } else {
            focusPoint = null
            returnTarget.copy(savedTarget)
            returning = true
        }
    }

    const update = (dt: number): void => {
        const k = 1 - Math.exp(-ORBIT_FOCUS_LERP * dt)
        if (focusPoint !== null) {
            target.lerp(focusPoint, k)
            distance += (ORBIT_FOCUS_DISTANCE - distance) * k
        } else if (returning) {
            target.lerp(returnTarget, k)
            distance += (savedDistance - distance) * k
        }
        applyCamera()
    }

    /* —— 指针事件：旋转 / 平移 / 滚轮缩放（前两者由操作设置绑定，全部随模式退出释放） —— */
    const input = getInputRegistry()
    let dragging: 'orbit' | 'pan' | null = null
    domElement.addEventListener('mousedown', (e: MouseEvent) => {
        if (input.matchesMouseButton('mouse_orbit', e.button)) dragging = 'orbit'
        else if (input.matchesMouseButton('mouse_pan', e.button)) dragging = 'pan'
    }, {signal})
    window.addEventListener('mouseup', () => {
        dragging = null
    }, {signal})
    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (dragging === null) return
        if (dragging === 'orbit') rotateBy(e.movementX, e.movementY)
        else panBy(e.movementX, e.movementY)
    }, {signal})
    domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
    }, {signal})
    domElement.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault()
        zoomBy(e.deltaY)
    }, {passive: false, signal})

    const translateTargetBy = (dx: number, dy: number, dz: number): void => {
        /* 聚焦锁定时禁用（与 panBy 一致） */
        if (focusPoint !== null) return
        /* 用户主动移动时取消聚焦回归动画（与 panBy 一致，否则 returning 永久为 true 会锁死移动） */
        returning = false
        /* 世界空间同步平移 target + camera（保持相对偏移不变），applyCamera 回写相机位姿，
         * 视角方向保持不变，等效 edit 模式的自由飞行（无固定焦点） */
        target.x += dx
        target.y += dy
        target.z += dz
        camera.position.x += dx
        camera.position.y += dy
        camera.position.z += dz
    }

    const getYaw = (): number => yaw

    return {target, rotateBy, panBy, zoomBy, focusTo, translateTargetBy, getYaw, update}
}

export interface ShowcaseScene {
    readonly scene: Scene
    readonly camera: PerspectiveCamera
    readonly orbit: OrbitCamera
    /** 每帧调用：无限网格跟随相机（复用主场景 grid.ts） */
    readonly followGrid: () => void
    /** 释放窗口级监听（resize / 相机指针事件，挂共享 canvas 的部分随宿主销毁） */
    readonly dispose: () => void
}

/**
 * 展示场景：自建独立 Three 场景 + 灯光（参数与 render/setup.ts 一致）+ 无限网格地面
 * + 轨道相机，复用主页共享渲染器（同一 WebGL 上下文，不自启第二个渲染循环）。
 * 角色全部面向 +Z，默认相机位于 +Z 侧上方，即从正面观察攻击动作。
 */
export const setupShowcaseScene = (renderer: WebGLRenderer): ShowcaseScene => {
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
    const orbit = createOrbitCamera(camera, renderer.domElement, events.signal)
    orbit.update(0)

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
    }, {signal: events.signal})

    const dispose = (): void => {
        events.abort()
    }

    return {scene, camera, orbit, followGrid, dispose}
}
