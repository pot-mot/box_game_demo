import {Raycaster, Vector2, Vector3, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide} from 'three'
import type {Intersection, Object3D, PerspectiveCamera, Scene} from 'three'
import {getInputRegistry} from '../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
import type {OrbitCamera} from './scene.ts'
import {
    CLICK_SLOP_PX,
    FOCUS_RING_COLOR,
    FOCUS_RING_INNER,
    FOCUS_RING_OUTER,
    FOCUS_RING_PULSE_FREQ,
} from './constants.ts'

/** 命中解析结果：聚焦点 + 选中标识（+ 可选聚焦距离 / 标记环落点与缩放） */
export interface ClickFocusHit<T> {
    readonly point: Vector3
    readonly value: T
    /** 聚焦观察距离（缺省 = 相机默认聚焦距离） */
    readonly distance?: number
    /** 脚下标记环落点（缺省 = 命中点投影到 y=0 平面） */
    readonly marker?: Vector3
    /** 标记环缩放（缺省 1；大体积对象可按尺寸放大） */
    readonly markerScale?: number
}

export interface ClickFocusOptions<T> {
    readonly scene: Scene
    readonly camera: PerspectiveCamera
    readonly domElement: HTMLElement
    readonly orbit: OrbitCamera
    /** 参与命中的对象（递归检测其子节点） */
    readonly getObjects: () => readonly Object3D[]
    /** 由命中对象解析聚焦目标（返回 undefined = 该命中不聚焦，继续尝试更远命中） */
    readonly resolve: (hit: Intersection) => ClickFocusHit<T> | undefined
    /** 聚焦变化回调（null = 取消聚焦） */
    readonly onFocus: (value: T | null) => void
}

export interface ClickFocusController {
    /** 每帧调用：驱动标记环呼吸动画 */
    readonly update: (dt: number) => void
    /** 释放指针监听与标记环资源 */
    readonly dispose: () => void
}

/**
 * 「点击聚焦」拾取器：监听模式统一的「聚焦」指针动作（`showcase_focus`，默认鼠标左键；判定位移阈值区分
 * 拖拽旋转与点击），对当前可选对象做射线检测，命中即把相机平滑聚焦到目标点、并在目标脚下显示**呼吸圆环标记**
 * （与动作 / 外观模块的聚焦环一致）；点击空处或 `Esc` 取消聚焦。
 *
 * 供非角色舞台的子模块（复杂地形与建筑 / 交互物）复用，与 `actor_stage.ts` 的点击聚焦语义保持一致。
 * 返回 `{update, dispose}`：`update(dt)` 驱动圆环呼吸，`dispose()` 释放监听与圆环资源。
 */
export const setupClickFocus = <T>(options: ClickFocusOptions<T>): ClickFocusController => {
    const input = getInputRegistry()
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const events = new AbortController()
    let downX = 0
    let downY = 0

    /* 脚下呼吸圆环（与 actor_stage 同参数） */
    const ringGeometry = new RingGeometry(FOCUS_RING_INNER, FOCUS_RING_OUTER, 48)
    ringGeometry.rotateX(-Math.PI / 2)
    const ringMaterial = new MeshBasicMaterial({
        color: FOCUS_RING_COLOR,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
    })
    const ring = new Mesh(ringGeometry, ringMaterial)
    ring.visible = false
    options.scene.add(ring)
    let elapsed = 0
    const fallbackMarker = new Vector3()

    const applyHit = (hit: ClickFocusHit<T>): void => {
        const marker = hit.marker ?? fallbackMarker.set(hit.point.x, 0, hit.point.z)
        ring.position.set(marker.x, marker.y, marker.z)
        ring.scale.setScalar(hit.markerScale ?? 1)
        ring.visible = true
        options.orbit.focusTo(hit.point, hit.distance)
        options.onFocus(hit.value)
    }

    const clearFocus = (): void => {
        ring.visible = false
        options.orbit.focusTo(null)
        options.onFocus(null)
    }

    options.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        downX = e.clientX
        downY = e.clientY
    }, {signal: events.signal})

    options.domElement.addEventListener('mouseup', (e: MouseEvent) => {
        if (!input.matchesMouseButton('showcase_focus', e.button)) return
        /* 聚焦键被其它「修饰键 + 鼠标」动作覆盖时让位（复核操作设置绑定） */
        if (input.isMouseButtonOverridden(e.button, MOUSE_ACTIONS_BY_MODE.showcase, 'showcase_focus')) return
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) return

        ndc.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, options.camera)
        const hits = raycaster.intersectObjects([...options.getObjects()], true)
        for (const hit of hits) {
            const resolved = options.resolve(hit)
            if (resolved !== undefined) {
                applyHit(resolved)
                return
            }
        }
        clearFocus()
    }, {signal: events.signal})

    const update = (dt: number): void => {
        if (!ring.visible) return
        /* 聚焦被外部取消（如 scene 统一 Esc）时同步隐藏标记环 */
        if (!options.orbit.isFocused()) {
            ring.visible = false
            return
        }
        elapsed += dt
        ringMaterial.opacity = 0.55 + 0.3 * Math.sin(elapsed * FOCUS_RING_PULSE_FREQ * Math.PI * 2)
    }

    const dispose = (): void => {
        events.abort()
        options.scene.remove(ring)
        ringGeometry.dispose()
        ringMaterial.dispose()
    }

    return {update, dispose}
}
