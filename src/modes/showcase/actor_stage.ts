import {Raycaster, Vector2, Vector3, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide} from 'three'
import type {Object3D, Scene, WebGLRenderer} from 'three'
import {setupShowcaseScene} from './scene.ts'
import type {ShowcaseScene} from './scene.ts'
import type {ShowcaseActorHandle} from './actor_handle.ts'
import {createPanel} from './panel.ts'
import type {PanelRowInfo} from './panel.ts'
import type {ShowcaseModuleRuntime} from './module.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import {
    CLICK_SLOP_PX,
    FOCUS_RING_COLOR,
    FOCUS_RING_INNER,
    FOCUS_RING_OUTER,
    FOCUS_RING_PULSE_FREQ,
    SPEED_OPTIONS,
    STEP_DT,
} from './constants.ts'

/**
 * 展示角色舞台选项：由各「以展示角色为主体」的子模块（动作 / 外观）提供。
 * `populate` 在场景就绪后同步调用，通过 `register` 登记角色与其面板静态行信息。
 */
export interface ActorStageOptions {
    readonly titleKey: StringLocaleKey
    readonly subtitleKey: StringLocaleKey
    /** 填充展示角色：`register(actor, info)` 登记角色 + 面板行；`onDirty` 供角色按需触发面板刷新 */
    readonly populate: (scene: Scene, register: (actor: ShowcaseActorHandle, info: PanelRowInfo) => void) => void
}

/**
 * 展示角色舞台：把「独立场景 + 键盘相机 + 多展示角色 + 聚焦环 + 拾取 + 暂停/单步/变速 + 信息面板」
 * 这套通用逻辑集中一处，供动作 / 外观等子模块复用（避免每模块重复 ~120 行）。
 *
 * 与生产代码的关系：角色动画仍由各 `ShowcaseActorHandle` 驱动器镜像 `world.ts` 注入，
 * 舞台只负责编排（时间倍率、聚焦、渲染、面板刷新），不含任何角色动画逻辑。
 */
export const setupActorStage = (renderer: WebGLRenderer, options: ActorStageOptions): ShowcaseModuleRuntime => {
    const sceneCtx: ShowcaseScene = setupShowcaseScene(renderer)

    const actors: ShowcaseActorHandle[] = []
    const panelInfos: PanelRowInfo[] = []
    const anchorToActor = new Map<Object3D, ShowcaseActorHandle>()
    options.populate(sceneCtx.scene, (actor, info) => {
        actors.push(actor)
        panelInfos.push(info)
        anchorToActor.set(actor.anchor, actor)
    })

    /* 聚焦高亮环（脚下呼吸光环） */
    const ringGeometry = new RingGeometry(FOCUS_RING_INNER, FOCUS_RING_OUTER, 48)
    ringGeometry.rotateX(-Math.PI / 2)
    const ringMaterial = new MeshBasicMaterial({
        color: FOCUS_RING_COLOR,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
    })
    const focusRing = new Mesh(ringGeometry, ringMaterial)
    focusRing.visible = false
    sceneCtx.scene.add(focusRing)

    /* 播放控制状态 */
    let playing = true
    let speed: number = SPEED_OPTIONS[SPEED_OPTIONS.length - 1]
    let stepQueued = false
    let focusActor: ShowcaseActorHandle | null = null

    const focusVec = new Vector3()
    const setFocus = (next: ShowcaseActorHandle | null): void => {
        if (focusActor === next) return
        focusActor = next
        for (const actor of actors) {
            actor.setDimmed(next !== null && actor !== next)
        }
        if (next !== null) {
            focusVec.set(next.anchor.position.x, 0.8, next.anchor.position.z)
            sceneCtx.orbit.focusTo(focusVec)
            focusRing.visible = true
        } else {
            sceneCtx.orbit.focusTo(null)
            focusRing.visible = false
        }
    }

    const panel = createPanel(panelInfos, {
        onTogglePause: () => { playing = !playing },
        onStep: () => {
            if (playing) playing = false
            stepQueued = true
        },
        onSpeed: (next: number) => { speed = next },
        onFocus: (actorId: number | null) => {
            if (actorId === null) {
                setFocus(null)
                return
            }
            setFocus(actors.find(a => a.id === actorId) ?? null)
        },
    }, {titleKey: options.titleKey, subtitleKey: options.subtitleKey})

    /* 点击拾取：按下位移小于阈值视为点击（区分拖拽旋转），命中子网格向上回溯到角色锚点 */
    const raycaster = new Raycaster()
    const pointerNdc = new Vector2()
    let downX = 0
    let downY = 0

    const events = new AbortController()
    renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        downX = e.clientX
        downY = e.clientY
    }, {signal: events.signal})
    renderer.domElement.addEventListener('mouseup', (e: MouseEvent) => {
        if (e.button !== 0) return
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) return

        pointerNdc.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1,
        )
        raycaster.setFromCamera(pointerNdc, sceneCtx.camera)
        const hits = raycaster.intersectObjects([...anchorToActor.keys()], true)
        for (const hit of hits) {
            let node: Object3D | null = hit.object
            while (node !== null && !anchorToActor.has(node)) {
                node = node.parent
            }
            if (node !== null) {
                setFocus(anchorToActor.get(node) ?? null)
                return
            }
        }
        setFocus(null)
    }, {signal: events.signal})

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault()
            if (e.repeat) return
            playing = !playing
        } else if (e.key === 'Escape') {
            setFocus(null)
        }
    }, {signal: events.signal})

    const advance = (dt: number): void => {
        for (const actor of actors) actor.update(dt)
    }

    let elapsed = 0
    const updater = (dt: number): void => {
        elapsed += dt
        if (playing) {
            advance(dt * speed)
        } else if (stepQueued) {
            advance(STEP_DT)
            stepQueued = false
        }

        sceneCtx.followGrid()
        sceneCtx.orbit.update(dt)

        if (focusActor !== null) {
            focusRing.position.set(focusActor.anchor.position.x, 0.02, focusActor.anchor.position.z)
            ringMaterial.opacity = 0.55 + 0.3 * Math.sin(elapsed * FOCUS_RING_PULSE_FREQ * Math.PI * 2)
        }

        renderer.render(sceneCtx.scene, sceneCtx.camera)
        panel.refresh(
            actors.flatMap(actor => actor.status === undefined ? [] : [actor.status()]),
            playing,
            speed,
            focusActor?.id ?? null,
        )
    }

    const dispose = (): void => {
        events.abort()
        sceneCtx.dispose()
        for (const actor of actors) actor.dispose()
        sceneCtx.scene.remove(focusRing)
        ringGeometry.dispose()
        ringMaterial.dispose()
        panel.dispose()
    }

    return {updater, dispose}
}
