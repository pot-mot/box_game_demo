import {Raycaster, Vector2, Vector3, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide} from 'three'
import type {Object3D, WebGLRenderer} from 'three'
import {setupShowcaseScene} from './scene.ts'
import type {ShowcaseScene} from './scene.ts'
import {setupKeyboardCamera} from './keyboard.ts'
import {createShowcaseActor} from './actor.ts'
import {createRaceActor} from './race_actor.ts'
import type {ShowcaseActorHandle} from './actor_handle.ts'
import {createNameLabel} from './label.ts'
import {createPanel} from './panel.ts'
import type {PanelRowInfo} from './panel.ts'
import {defaultHoldMode, weaponPresetOrDefault} from '../../character/weapon/catalog.ts'
import {HOLD_MODES, HOLD_MODE_LABELS, type HoldMode} from '../../character/weapon/hold_mode.ts'
import {factionColorOf} from '../../entity/character/appearance/constants.ts'
import {
    CLICK_SLOP_PX,
    FOCUS_RING_COLOR,
    FOCUS_RING_INNER,
    FOCUS_RING_OUTER,
    FOCUS_RING_PULSE_FREQ,
    MELEE_ROW_Z,
    MELEE_ROW_SPACING,
    MELEE_SPACING,
    RACE_SHOWCASE_ROSTER,
    RACE_SHOWCASE_ROW_Z,
    RACE_SHOWCASE_SPACING,
    RANGED_ROW_Z,
    RANGED_SPACING,
    SHOWCASE_ROSTER,
    SPEED_OPTIONS,
    STEP_DT,
} from './constants.ts'

/** 展示模式控制器：遵循 modes 分包约定，updater 由主页单 RAF 循环统一调度 */
export interface ShowcaseModeController {
    /** 每帧调用：推进时间线 + 轨道相机 + 聚焦环 + 渲染展示场景 + 面板刷新 */
    readonly updater: (dt: number) => void
    /** 返回启动屏：释放全部面板/监听/场景资源后回调宿主 onExit */
    readonly exit: () => void
}

/** 展示模式装配所需的宿主上下文 */
export interface ShowcaseModeHost {
    /** 主页共享渲染器（展示场景复用同一 WebGL 上下文，不自建渲染器/渲染循环） */
    readonly renderer: WebGLRenderer
    /** 资源释放完成后由 exit 调用（宿主负责停循环、销毁渲染器、重现启动屏） */
    readonly onExit: () => void
}

/**
 * 展示模式装配：15 个展示角色 + 信息面板 + 拾取/键盘控制。
 * 复用主页共享渲染器与单 RAF 循环；所有 DOM/事件资源由 AbortController 与
 * dispose 链管理，exit 时完全释放，随后回调宿主返回启动屏。
 */
export const setupShowcaseMode = (host: ShowcaseModeHost): ShowcaseModeController => {
    const {renderer, onExit} = host

    /* —— 展示场景（独立 Scene/Camera/灯光/网格 + 轨道相机，复用共享渲染器） —— */
    const sceneCtx: ShowcaseScene = setupShowcaseScene(renderer)

    /* —— 键盘相机移动（对标 edit 模式的 setupKeyboardCamera） —— */
    const keyboardCamera = setupKeyboardCamera(sceneCtx.orbit)

    /* —— 按清单创建展示角色：近战按持握模式三排（单持 → 双手共持 → 双持）+ 远程一排 + 种族/套装一排，全部面向 +Z —— */
    const actors: ShowcaseActorHandle[] = []
    /** 面板静态信息（武器攻击角色用 ActorStatus；种族/套装角色用固定标签） */
    const panelInfos: PanelRowInfo[] = []
    const anchorToActor = new Map<Object3D, ShowcaseActorHandle>()
    let nextFaction = 0

    const placeRow = (kind: 'melee' | 'ranged', holdMode: HoldMode | undefined, rowZ: number, spacing: number): void => {
        const entries = SHOWCASE_ROSTER.filter(e => e.kind === kind && e.holdMode === holdMode)
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            if (entry === undefined) continue
            /* 清单条目 skillId 即武器 id：攻击链（段/时长/阶段/冷却）与模型全部取自武器模组 */
            const weapon = weaponPresetOrDefault(entry.skillId)
            const mode = entry.holdMode ?? defaultHoldMode(weapon)
            const weaponName = weapon.name
            const actor = createShowcaseActor({
                id: actors.length,
                scene: sceneCtx.scene,
                weapon,
                holdMode: mode,
                faction: nextFaction++,
                x: (i - (entries.length - 1) / 2) * spacing,
                z: rowZ,
                weaponName,
            })
            /* 头顶名称标签（武器名 + 类型/持握模式）—— 句柄交给 actor，随其 dispose 统一回收 */
            actor.attachLabel(createNameLabel(weaponName, weapon.type === 'melee' ? `近战 · ${HOLD_MODE_LABELS[mode]}` : '远程武器'))
            actors.push(actor)
            anchorToActor.set(actor.anchor, actor)
            panelInfos.push({
                id: actor.id,
                skillName: actor.weaponName,
                weaponName: actor.weaponName,
                holdModeLabel: actor.holdModeLabel,
                colorHex: `#${factionColorOf(actor.factionColor).toString(16).padStart(6, '0')}`,
            })
        }
    }
    for (const [index, mode] of HOLD_MODES.entries()) {
        placeRow('melee', mode, MELEE_ROW_Z - index * MELEE_ROW_SPACING, MELEE_SPACING)
    }
    placeRow('ranged', undefined, RANGED_ROW_Z, RANGED_SPACING)

    /* —— 种族 / 套装展示排（最后一排）：骷髅 / 兽人 / 精灵 三族 + 三套护甲，站立行走各 2s 交替 —— */
    for (let i = 0; i < RACE_SHOWCASE_ROSTER.length; i++) {
        const entry = RACE_SHOWCASE_ROSTER[i]
        if (entry === undefined) continue
        const subtitle = entry.kind === 'race' ? '种族肢体' : '护甲套装'
        const actor = createRaceActor({
            id: actors.length,
            scene: sceneCtx.scene,
            x: (i - (RACE_SHOWCASE_ROSTER.length - 1) / 2) * RACE_SHOWCASE_SPACING,
            z: RACE_SHOWCASE_ROW_Z,
            name: entry.name,
            subtitle,
            faction: entry.faction,
            limb: entry.limb ?? {},
            armor: entry.armor ?? {},
        })
        actor.attachLabel(createNameLabel(entry.name, subtitle))
        actors.push(actor)
        anchorToActor.set(actor.anchor, actor)
        panelInfos.push({
            id: actor.id,
            skillName: entry.name,
            weaponName: entry.name,
            holdModeLabel: subtitle,
            colorHex: `#${factionColorOf(entry.faction).toString(16).padStart(6, '0')}`,
        })
    }

    /* —— 聚焦高亮环（脚下呼吸光环） —— */
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

    /* —— 播放控制状态 —— */
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
        /* 未聚焦时启用键盘移动，聚焦时禁用（对标 edit 模式的 setEnabled） */
        keyboardCamera.setEnabled(next === null)
    }

    /* —— 信息面板（panelInfos 已在创建角色时同步收集） —— */
    const panel = createPanel(panelInfos, {
        onTogglePause: () => {
            playing = !playing
        },
        onStep: () => {
            if (playing) playing = false
            stepQueued = true
        },
        onSpeed: (next: number) => {
            speed = next
        },
        onFocus: (actorId: number | null) => {
            if (actorId === null) {
                setFocus(null)
                return
            }
            setFocus(actors.find(a => a.id === actorId) ?? null)
        },
    })

    /* —— 点击拾取：按下位移小于阈值视为点击（区分拖拽旋转），命中子网格向上回溯到角色锚点 —— */
    const raycaster = new Raycaster()
    const pointerNdc = new Vector2()
    let downX = 0
    let downY = 0

    /* 展示模式全部窗口级/画布级监听由 AbortController 管理，exit 一次释放 */
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
        /* 点击空处取消聚焦 */
        setFocus(null)
    }, {signal: events.signal})

    /* —— 键盘：空格暂停 / Esc 取消聚焦 —— */
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault()
            /* 忽略按住不放产生的 auto-repeat，防止高频翻转暂停 */
            if (e.repeat) return
            playing = !playing
        } else if (e.key === 'Escape') {
            setFocus(null)
        }
    }, {signal: events.signal})

    /* —— 每帧推进（由主页单 RAF 调度；渲染展示场景用共享渲染器） —— */
    const advance = (dt: number): void => {
        for (const actor of actors) {
            actor.update(dt)
        }
    }

    let elapsed = 0
    const updater = (dt: number): void => {
        elapsed += dt
        if (playing) {
            advance(dt * speed)
        } else if (stepQueued) {
            /* 单步：暂停时推进一帧固定步长 */
            advance(STEP_DT)
            stepQueued = false
        }

        keyboardCamera.updater()
        sceneCtx.followGrid()
        sceneCtx.orbit.update(dt)

        /* 聚焦环跟随 + 呼吸 */
        if (focusActor !== null) {
            focusRing.position.set(focusActor.anchor.position.x, 0.02, focusActor.anchor.position.z)
            ringMaterial.opacity = 0.55 + 0.3 * Math.sin(elapsed * FOCUS_RING_PULSE_FREQ * Math.PI * 2)
        }

        renderer.render(sceneCtx.scene, sceneCtx.camera)
        panel.refresh(
            /* 仅武器攻击角色提供攻击状态；种族/套装角色无攻击面板数据（面板据此显示「—」） */
            actors.flatMap(actor => actor.status === undefined ? [] : [actor.status()]),
            playing,
            speed,
            focusActor?.id ?? null,
        )
    }

    /** 返回启动屏：先停事件防再入，再释放全部资源，最后交回宿主 */
    const exit = (): void => {
        events.abort()
        sceneCtx.dispose()
        for (const actor of actors) {
            actor.dispose()
        }
        sceneCtx.scene.remove(focusRing)
        ringGeometry.dispose()
        ringMaterial.dispose()
        panel.dispose()
        onExit()
    }

    return {updater, exit}
}
