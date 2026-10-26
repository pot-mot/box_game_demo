import {Vector3, type PerspectiveCamera} from 'three'
import {getInputRegistry} from '../../input/registry.ts'
import type {InputAction} from '../../input/types.ts'
import {MOVE_STEP} from '../constants.ts'
import {
    CAMERA_FREE_PITCH_MAX,
    CAMERA_FREE_PITCH_MIN,
    CAMERA_ORBIT_DEFAULT_DISTANCE,
    CAMERA_ORBIT_DEFAULT_PITCH,
    CAMERA_ORBIT_DEFAULT_TARGET_Y,
    CAMERA_ORBIT_DEFAULT_TARGET_Z,
    CAMERA_ORBIT_DEFAULT_YAW,
    CAMERA_ORBIT_FOCUS_DISTANCE,
    CAMERA_ORBIT_FOCUS_LERP,
    CAMERA_ORBIT_MAX_DISTANCE,
    CAMERA_ORBIT_MIN_DISTANCE,
    CAMERA_ORBIT_PAN_SENSITIVITY,
    CAMERA_ORBIT_PITCH_MAX,
    CAMERA_ORBIT_PITCH_MIN,
    CAMERA_ORBIT_ROTATE_SENSITIVITY,
    CAMERA_ORBIT_WHEEL_SENSITIVITY,
    CAMERA_ZOOM_SMOOTH_FACTOR,
    FREE_FLIGHT_BOOST_MULTIPLIER,
} from './constants.ts'

/** 聚焦控制最小接口（`setupClickFocus` 与玩家相机 / 纯摄像机均实现它） */
export interface FocusController {
    /** 聚焦到指定世界坐标（null = 取消聚焦并平滑回归）；focusDistance 缺省用默认聚焦距离 */
    readonly focusTo: (position: Vector3 | null, focusDistance?: number) => void
    /** 当前是否处于聚焦状态 */
    readonly isFocused: () => boolean
}

/**
 * 纯摄像机控制器：目标点 + 偏航/俯仰/距离球坐标，支持自由飞行、旋转、平移、缩放与聚焦。
 *
 * 未聚焦时以第一人称自由飞行为基准（WASDZX 平移 target、鼠标拖拽原地转视角），
 * 聚焦时相机平滑飞向目标并环绕，Esc / `focusTo(null)` 恢复自由飞行。
 * 导出供单测直接驱动（无需 WebGL 渲染器）。
 */
export interface CameraControl extends FocusController {
    readonly target: Vector3
    rotateBy: (dxPx: number, dyPx: number) => void
    panBy: (dxPx: number, dyPx: number) => void
    zoomBy: (wheelDelta: number) => void
    /** 直接设置观察距离（自由视角下生效；聚焦 / 回归过渡期间忽略） */
    setDistance: (distance: number) => void
    /**
     * 设置跟随目标（非 null 时相机目标持续跟随该点；聚焦优先于跟随，取消聚焦后自动恢复跟随）。
     * 按引用持有该向量，调用方可逐帧原地更新。
     */
    setFollow: (point: Vector3 | null) => void
    /** 按 yaw 方向同步平移 target + camera（水平）或调整 target.y（垂直） */
    translateTargetBy: (dx: number, dy: number, dz: number) => void
    /** 返回当前偏航角（供键盘相机计算移动方向 / 玩家移动基准） */
    getYaw: () => number
    /** 设置相机朝向（偏航 / 俯仰）：未聚焦时保持相机位置不动（第一人称），聚焦/跟随时绕目标旋转 */
    setOrientation: (yaw: number, pitch: number) => void
    /** 启用 / 禁用全部相机控制（旋转、平移、键盘自由飞行），用于拖拽等场景临时锁相机 */
    setEnabled: (v: boolean) => void
    /** 启用 / 禁用滚轮缩放（编辑模式地形雕刻勾选时让位给雕刻） */
    setZoomEnabled: (v: boolean) => void
    /** 每帧调用：执行聚焦插值并回写相机位姿 */
    update: (dt: number) => void
}

export interface CameraControlOptions {
    /** 本模式可重绑的指针动作集合：用于让基础行为让位给「修饰键+鼠标」的绑定动作 */
    readonly pointerActions: readonly InputAction[]
    /** WASDZX 是否驱动相机自由飞行（缺省 true）；玩家主控 / 跟随场景传 false */
    readonly keyboardFreeFlight?: boolean
    /** 是否允许右键拖拽平移（缺省 true） */
    readonly panEnabled?: boolean
    /** 是否允许滚轮缩放（缺省 true） */
    readonly zoomEnabled?: boolean
    /** 释放所有窗口级监听（缺省不释放，随模式生命周期存续） */
    readonly signal?: AbortSignal
}

const defaultTarget = (): Vector3 => new Vector3(0, CAMERA_ORBIT_DEFAULT_TARGET_Y, CAMERA_ORBIT_DEFAULT_TARGET_Z)

export const createCameraControl = (
    camera: PerspectiveCamera,
    domElement: HTMLElement,
    options: CameraControlOptions,
): CameraControl => {
    const keyboardFreeFlight = options.keyboardFreeFlight ?? true
    const panEnabled = options.panEnabled ?? true
    let zoomEnabled = options.zoomEnabled ?? true
    let enabled = true

    const target = defaultTarget()
    let yaw = CAMERA_ORBIT_DEFAULT_YAW
    let pitch = CAMERA_ORBIT_DEFAULT_PITCH
    let distance = CAMERA_ORBIT_DEFAULT_DISTANCE
    /** 渲染距离：逐帧平滑逼近逻辑距离（`distance`），消除滚轮跳变 */
    let renderDistance = distance

    /* 聚焦目标（非 null 时持续把 target/distance 拉向特写位）；returning = 取消聚焦后回归快照视角 */
    let focusPoint: Vector3 | null = null
    let focusDistance = CAMERA_ORBIT_FOCUS_DISTANCE
    let returning = false
    /* 跟随目标（非 null 时 target 持续跟随该点；聚焦优先）。按引用持有，调用方原地更新。 */
    let followPoint: Vector3 | null = null
    /* 进入聚焦前的自由视角快照（退出聚焦时回归，保留用户调整的目标点与距离） */
    const savedTarget = defaultTarget()
    let savedDistance = CAMERA_ORBIT_DEFAULT_DISTANCE
    const returnTarget = defaultTarget()

    const applyCamera = (): void => {
        camera.position.set(
            target.x + renderDistance * Math.cos(pitch) * Math.sin(yaw),
            target.y + renderDistance * Math.sin(pitch),
            target.z + renderDistance * Math.cos(pitch) * Math.cos(yaw),
        )
        camera.lookAt(target)
    }

    const rotateBy = (dxPx: number, dyPx: number): void => {
        if (!enabled) return
        if (focusPoint !== null || followPoint !== null) {
            /* 聚焦 / 跟随时：绕 target 轨道旋转（观察目标） */
            yaw -= dxPx * CAMERA_ORBIT_ROTATE_SENSITIVITY
            pitch += dyPx * CAMERA_ORBIT_ROTATE_SENSITIVITY
            pitch = Math.min(Math.max(pitch, CAMERA_ORBIT_PITCH_MIN), CAMERA_ORBIT_PITCH_MAX)
            return
        }
        /* 未聚焦：以相机自身为轴原地旋转（对标第一人称），
         * 保持 camera.position 不变，反向移动 target，使 applyCamera 回写后相机位置不变 */
        returning = false
        const camX = camera.position.x
        const camY = camera.position.y
        const camZ = camera.position.z
        yaw -= dxPx * CAMERA_ORBIT_ROTATE_SENSITIVITY
        pitch += dyPx * CAMERA_ORBIT_ROTATE_SENSITIVITY
        pitch = Math.min(Math.max(pitch, CAMERA_FREE_PITCH_MIN), CAMERA_FREE_PITCH_MAX)
        target.set(
            camX - distance * Math.cos(pitch) * Math.sin(yaw),
            camY - distance * Math.sin(pitch),
            camZ - distance * Math.cos(pitch) * Math.cos(yaw),
        )
    }

    const panBy = (dxPx: number, dyPx: number): void => {
        if (!enabled || !panEnabled) return
        /* 聚焦 / 跟随锁定时禁用平移（避免与目标吸附互相拉扯） */
        if (focusPoint !== null || followPoint !== null) return
        returning = false
        /* 相机水平右向 / 前向（距离越远步幅越大），拖拽方向 = 场景移动方向 */
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)
        const fwdX = Math.sin(yaw)
        const fwdZ = Math.cos(yaw)
        const k = distance * CAMERA_ORBIT_PAN_SENSITIVITY
        target.x += (-dxPx * rightX - dyPx * fwdX) * k
        target.z += (-dxPx * rightZ - dyPx * fwdZ) * k
    }

    const zoomBy = (wheelDelta: number): void => {
        if (!enabled || !zoomEnabled) return
        /* 聚焦期间与进入/退出过渡期间禁用滚轮缩放：
         * 保持自动取景距离不被干扰，退出聚焦后由回归插值恢复快照距离 */
        if (focusPoint !== null || returning) return
        distance = Math.min(
            Math.max(distance * Math.exp(wheelDelta * CAMERA_ORBIT_WHEEL_SENSITIVITY), CAMERA_ORBIT_MIN_DISTANCE),
            CAMERA_ORBIT_MAX_DISTANCE,
        )
    }

    const setDistance = (next: number): void => {
        /* 与 zoomBy 同门控：聚焦 / 回归过渡期间不直接改距离，避免打断自动取景 */
        if (focusPoint !== null || returning) return
        distance = Math.min(Math.max(next, CAMERA_ORBIT_MIN_DISTANCE), CAMERA_ORBIT_MAX_DISTANCE)
        /* 直接设定（如子模块初始化取景）应立即可见，不参与平滑 */
        renderDistance = distance
    }

    const focusTo = (position: Vector3 | null, targetDistance?: number): void => {
        if (position !== null) {
            /* 首次进入聚焦时快照当前自由视角（连续切换聚焦目标不覆盖快照） */
            if (focusPoint === null && !returning) {
                savedTarget.copy(target)
                savedDistance = distance
            }
            focusPoint = position.clone()
            focusDistance = targetDistance ?? CAMERA_ORBIT_FOCUS_DISTANCE
            returning = false
        } else {
            focusPoint = null
            returnTarget.copy(savedTarget)
            returning = true
        }
    }

    const setFollow = (point: Vector3 | null): void => {
        followPoint = point
        /* 跟随启用时取消聚焦回归动画，避免 returning 与跟随互相拉扯 */
        if (point !== null) returning = false
    }

    const isFocused = (): boolean => focusPoint !== null

    const setOrientation = (yawValue: number, pitchValue: number): void => {
        yaw = yawValue
        pitch = pitchValue
        /* 离散重设朝向（如载入存档 / 骨骼编辑取景）：距离立即生效，不参与平滑 */
        renderDistance = distance
        /* 未聚焦 / 未跟随时保持相机位置不动（第一人称），反推 target；聚焦/跟随时保留轨道行为 */
        if (focusPoint === null && followPoint === null) {
            const camX = camera.position.x
            const camY = camera.position.y
            const camZ = camera.position.z
            target.set(
                camX - distance * Math.cos(pitch) * Math.sin(yaw),
                camY - distance * Math.sin(pitch),
                camZ - distance * Math.cos(pitch) * Math.cos(yaw),
            )
        }
        applyCamera()
    }

    const translateTargetBy = (dx: number, dy: number, dz: number): void => {
        /* 聚焦锁定时禁用（与 panBy 一致） */
        if (focusPoint !== null) return
        /* 用户主动移动时取消聚焦回归动画（与 panBy 一致，否则 returning 永久为 true 会锁死移动） */
        returning = false
        /* 世界空间同步平移 target + camera（保持相对偏移不变），applyCamera 回写相机位姿，
         * 视角方向保持不变，等效第一人称自由飞行（无固定焦点） */
        target.x += dx
        target.y += dy
        target.z += dz
        camera.position.x += dx
        camera.position.y += dy
        camera.position.z += dz
    }

    const getYaw = (): number => yaw

    /** 键盘自由飞行式平移（第一人称语义）：按相机偏航角计算世界位移，施加到 target（相机随 applyCamera 跟随）。 */
    const applyKeyboardFreeFlight = (): void => {
        if (!enabled || !keyboardFreeFlight || focusPoint !== null || followPoint !== null) return
        /* 水平前向 = 相机看向 target 的方向 (-sin, -cos)，右向 = (cos, -sin) */
        const fwdX = -Math.sin(yaw)
        const fwdZ = -Math.cos(yaw)
        const rightX = Math.cos(yaw)
        const rightZ = -Math.sin(yaw)
        const step = MOVE_STEP * (input.isActionActive('boost') ? FREE_FLIGHT_BOOST_MULTIPLIER : 1)

        let dx = 0
        let dz = 0
        if (input.isActionActive('move_forward')) { dx += fwdX * step; dz += fwdZ * step }
        if (input.isActionActive('move_backward')) { dx -= fwdX * step; dz -= fwdZ * step }
        if (input.isActionActive('move_left')) { dx -= rightX * step; dz -= rightZ * step }
        if (input.isActionActive('move_right')) { dx += rightX * step; dz += rightZ * step }

        let dy = 0
        if (input.isActionActive('move_up')) dy += step
        if (input.isActionActive('move_down')) dy -= step

        if (dx !== 0 || dy !== 0 || dz !== 0) translateTargetBy(dx, dy, dz)
    }

    const update = (dt: number): void => {
        applyKeyboardFreeFlight()
        const k = 1 - Math.exp(-CAMERA_ORBIT_FOCUS_LERP * dt)
        if (focusPoint !== null) {
            target.lerp(focusPoint, k)
            distance += (focusDistance - distance) * k
        } else if (followPoint !== null) {
            target.lerp(followPoint, k)
        } else if (returning) {
            target.lerp(returnTarget, k)
            distance += (savedDistance - distance) * k
        }
        /* 渲染距离平滑逼近逻辑距离：滚轮 / 聚焦 / 回归改变距离时避免单帧跳变 */
        renderDistance += (distance - renderDistance) * (1 - Math.exp(-CAMERA_ZOOM_SMOOTH_FACTOR * dt))
        applyCamera()
    }

    /* —— 指针事件：旋转 / 平移 / 滚轮缩放（前两者由操作设置绑定，全部随模式退出释放） —— */
    const input = getInputRegistry()
    const pointerActions = options.pointerActions
    const signal = options.signal
    let dragging: 'orbit' | 'pan' | null = null
    const clearDragging = (): void => { dragging = null }
    domElement.addEventListener('mousedown', (e: MouseEvent) => {
        if (!enabled) return
        /* 按键被本模式「修饰键+鼠标」的其它动作覆盖时让位（如聚焦键加了修饰键组合） */
        if (input.matchesMouseButton('mouse_orbit', e.button)
            && !input.isMouseButtonOverridden(e.button, pointerActions, 'mouse_orbit')) dragging = 'orbit'
        else if (panEnabled && input.matchesMouseButton('mouse_pan', e.button)
            && !input.isMouseButtonOverridden(e.button, pointerActions, 'mouse_pan')) dragging = 'pan'
    }, {signal})
    window.addEventListener('mouseup', clearDragging, {signal})
    /* 窗口失焦 / 切后台时释放拖拽：在窗口外或原生弹层上松开鼠标可能收不到 mouseup，
     * 否则之后仅移动鼠标也会继续旋转 / 平移 */
    window.addEventListener('blur', clearDragging, {signal})
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') clearDragging()
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
        if (!enabled || !zoomEnabled) return
        e.preventDefault()
        zoomBy(e.deltaY)
    }, {passive: false, signal})
    /* Esc 解除聚焦（全模块统一）：恢复自由飞行；动作 / 外观模块另有监听以复位高亮环与变暗 */
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && focusPoint !== null) focusTo(null)
    }, {signal})

    return {
        target,
        rotateBy,
        panBy,
        zoomBy,
        setDistance,
        focusTo,
        setFollow,
        isFocused,
        translateTargetBy,
        getYaw,
        setOrientation,
        setEnabled: (v: boolean) => { enabled = v; if (!v) dragging = null },
        setZoomEnabled: (v: boolean) => { zoomEnabled = v },
        update,
    }
}
