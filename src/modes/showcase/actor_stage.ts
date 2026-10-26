import {Raycaster, Vector2, Vector3, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide} from 'three'
import type {Object3D, Scene, WebGLRenderer} from 'three'
import {setupShowcaseScene} from './scene.ts'
import type {ShowcaseScene} from './scene.ts'
import type {ShowcaseActorHandle, ShowcaseAction} from './actor_handle.ts'
import {SHOWCASE_ACTIONS, isShowcaseAction} from './actor_handle.ts'
import {SHOWCASE_DEBUG_KINDS, type ShowcaseDebugKind} from './actor_debug.ts'
import {createPanel} from './panel.ts'
import type {PanelRowInfo, PanelTab} from './panel.ts'
import type {ShowcaseModuleRuntime} from './module.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import {getInputRegistry, isFocusInteractive} from '../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
import {
    CLICK_SLOP_PX,
    FOCUS_RING_COLOR,
    FOCUS_RING_INNER,
    FOCUS_RING_OUTER,
    FOCUS_RING_PULSE_FREQ,
    SPEED_OPTIONS,
    STEP_DT,
} from './constants.ts'

/** 展示舞台的一个 Tab：一组展示角色 + 面板行信息 */
export interface ActorStageTab {
    readonly key: string
    readonly labelKey: StringLocaleKey
    /** 填充该 Tab 的展示角色：`register(actor, info)` 登记角色 + 面板行 */
    readonly populate: (scene: Scene, register: (actor: ShowcaseActorHandle, info: PanelRowInfo) => void) => void
}

/**
 * 展示角色舞台选项：由各「以展示角色为主体」的子模块（攻击模组 / 外观）提供。
 * `tabs` 提供一组 Tab（单 Tab 时不显示 Tab 栏）；每个 Tab 的 `populate` 在场景就绪后同步调用。
 */
export interface ActorStageOptions {
    readonly titleKey: StringLocaleKey
    readonly subtitleKey: StringLocaleKey
    readonly tabs: readonly ActorStageTab[]
    /** 外观展示：左侧面板提供非攻击动作选择（切换作用于全部 Tab 角色） */
    readonly actionPicker?: {
        readonly initial?: ShowcaseAction
    }
}

/**
 * 展示角色舞台：把「独立场景 + 键盘相机 + 多展示角色 + 多 Tab + 聚焦环 + 拾取 + 暂停/单步/变速 +
 * 调试箱开关 + 信息面板」这套通用逻辑集中一处，供攻击模组 / 外观等子模块复用。
 *
 * 与生产代码的关系：角色动画仍由各 `ShowcaseActorHandle` 驱动器镜像 `world.ts` 注入，
 * 舞台只负责编排（时间倍率、Tab 切换、聚焦、调试箱开关、渲染、面板刷新），不含任何角色动画逻辑。
 */
export const setupActorStage = (renderer: WebGLRenderer, options: ActorStageOptions): ShowcaseModuleRuntime => {
    const sceneCtx: ShowcaseScene = setupShowcaseScene(renderer)

    const anchorToActor = new Map<Object3D, ShowcaseActorHandle>()
    interface TabData {
        readonly key: string
        readonly actors: ShowcaseActorHandle[]
        readonly infos: PanelRowInfo[]
    }
    const tabDatas: TabData[] = options.tabs.map(tab => {
        const actors: ShowcaseActorHandle[] = []
        const infos: PanelRowInfo[] = []
        tab.populate(sceneCtx.scene, (actor, info) => {
            actors.push(actor)
            infos.push(info)
            anchorToActor.set(actor.anchor, actor)
        })
        return {key: tab.key, actors, infos}
    })
    const allActors = tabDatas.flatMap(tab => tab.actors)
    let activeTab = 0

    /* —— 调试箱状态（物理碰撞箱 / 受击箱 / 攻击箱；默认全关） —— */
    const debugState: Record<ShowcaseDebugKind, boolean> = {collision: false, hurt: false, attack: false}
    const applyDebugTo = (actors: readonly ShowcaseActorHandle[]): void => {
        for (const actor of actors) {
            for (const kind of SHOWCASE_DEBUG_KINDS) actor.setDebugVisible?.(kind, debugState[kind])
        }
    }
    const clearDebug = (actors: readonly ShowcaseActorHandle[]): void => {
        for (const actor of actors) {
            for (const kind of SHOWCASE_DEBUG_KINDS) actor.setDebugVisible?.(kind, false)
        }
    }

    /* 非激活 Tab 的角色隐藏 */
    for (let i = 1; i < tabDatas.length; i++) {
        for (const actor of tabDatas[i].actors) actor.anchor.visible = false
    }

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
        for (const actor of allActors) {
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

    const panelTabs: PanelTab[] = options.tabs.map(tab => ({key: tab.key, labelKey: tab.labelKey}))
    const switchTab = (index: number): void => {
        if (index < 0 || index === activeTab) return
        clearDebug(tabDatas[activeTab]?.actors ?? [])
        for (const actor of tabDatas[activeTab]?.actors ?? []) {
            actor.clearProjectiles?.()
            actor.anchor.visible = false
        }
        activeTab = index
        setFocus(null)
        const tab = tabDatas[activeTab]
        for (const actor of tab.actors) actor.anchor.visible = true
        panel.setInfos(tab.infos, tab.key)
        applyDebugTo(tab.actors)
    }

    const panel = createPanel(tabDatas[0]?.infos ?? [], {
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
            setFocus(allActors.find(a => a.id === actorId) ?? null)
        },
        onDebugToggle: (kind: ShowcaseDebugKind, on: boolean) => {
            debugState[kind] = on
            applyDebugTo(tabDatas[activeTab]?.actors ?? [])
        },
        onTab: (key: string) => switchTab(tabDatas.findIndex(tab => tab.key === key)),
        onAction: (value: string) => {
            if (isShowcaseAction(value)) applyAction(value)
        },
    }, {
        titleKey: options.titleKey,
        subtitleKey: options.subtitleKey,
        tabs: panelTabs,
        ...(options.actionPicker === undefined ? {} : {
            actionSelect: {
                labelKey: 'showcase.action.title' as const,
                initialValue: options.actionPicker.initial ?? 'idle',
                choices: SHOWCASE_ACTIONS.map(action => ({
                    value: action,
                    labelKey: `entity.state.${action}`,
                })),
            },
        }),
    })
    panel.setInfos(tabDatas[0]?.infos ?? [], tabDatas[0]?.key)

    const applyAction = (action: ShowcaseAction): void => {
        for (const actor of allActors) actor.setAction?.(action)
    }
    if (options.actionPicker !== undefined) applyAction(options.actionPicker.initial ?? 'idle')

    /* 点击拾取：按下位移小于阈值视为点击（区分拖拽旋转），命中子网格向上回溯到角色锚点 */
    const raycaster = new Raycaster()
    const pointerNdc = new Vector2()
    let downX = 0
    let downY = 0

    const events = new AbortController()
    const input = getInputRegistry()
    renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        downX = e.clientX
        downY = e.clientY
    }, {signal: events.signal})
    renderer.domElement.addEventListener('mouseup', (e: MouseEvent) => {
        if (!input.matchesMouseButton('showcase_focus', e.button)) return
        if (input.isMouseButtonOverridden(e.button, MOUSE_ACTIONS_BY_MODE.showcase, 'showcase_focus')) return
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) return

        pointerNdc.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1,
        )
        raycaster.setFromCamera(pointerNdc, sceneCtx.camera)
        const hits = raycaster.intersectObjects([...tabDatas[activeTab]?.actors.map(a => a.anchor) ?? []], true)
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
        if (isFocusInteractive(e.target) && e.code !== 'Escape') return
        if (e.code === 'Space') {
            e.preventDefault()
            if (e.repeat) return
            playing = !playing
        } else if (e.key === 'Escape') {
            setFocus(null)
        }
    }, {signal: events.signal})

    const advance = (dt: number): void => {
        const actors = tabDatas[activeTab]?.actors ?? []
        for (const actor of actors) actor.update(dt)
        for (const actor of actors) actor.debugTick?.()
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
        const actors = tabDatas[activeTab]?.actors ?? []
        panel.refresh(
            actors.flatMap(actor => actor.status === undefined ? [] : [actor.status()]),
            playing,
            speed,
            focusActor?.id ?? null,
            debugState,
        )
    }

    const dispose = (): void => {
        events.abort()
        sceneCtx.dispose()
        for (const actor of allActors) actor.dispose()
        sceneCtx.scene.remove(focusRing)
        ringGeometry.dispose()
        ringMaterial.dispose()
        panel.dispose()
    }

    return {updater, dispose}
}
