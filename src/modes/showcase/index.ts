import {Raycaster, Vector2, Vector3, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide} from 'three'
import type {Object3D, WebGLRenderer} from 'three'
import {setupShowcaseScene} from './scene.ts'
import type {ShowcaseScene} from './scene.ts'
import {setupKeyboardCamera} from './keyboard.ts'
import {createShowcaseActor} from './actor.ts'
import type {ShowcaseActor} from './actor.ts'
import {createNameLabel} from './label.ts'
import {createPanel} from './panel.ts'
import type {PanelRowInfo} from './panel.ts'
import {buildMeleeSkillSlots} from '../../character/combat/melee_skill.ts'
import {RANGED_SKILL_PRESETS} from '../../character/combat/ranged_skill.ts'
import type {SkillSlot} from '../../character/combat/skill_types.ts'
import {createSkillSlot} from '../../character/combat/skill_types.ts'
import {SELECT_PALETTE} from '../../entity/character/appearance/constants.ts'
import {
    CLICK_SLOP_PX,
    displayNameOf,
    FOCUS_RING_COLOR,
    FOCUS_RING_INNER,
    FOCUS_RING_OUTER,
    FOCUS_RING_PULSE_FREQ,
    MELEE_ROW_Z,
    MELEE_SPACING,
    RANGED_ROW_Z,
    RANGED_SPACING,
    SHOWCASE_ROSTER,
    SKILL_DISPLAY_NAMES,
    SPEED_OPTIONS,
    STEP_DT,
    WEAPON_DISPLAY_NAMES,
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

/** 按清单解析技能槽（近战 = 武器 4 槽双链，远程 = 单槽；phases 完整来自预设） */
const resolveSkillSlots = (skillId: string, kind: 'melee' | 'ranged'): SkillSlot[] => {
    if (kind === 'melee') {
        /* skillId 为武器 id：装配 [轻1, 重1, 轻2, 重2] 循环链 */
        return buildMeleeSkillSlots(skillId)
    }
    if (!(skillId in RANGED_SKILL_PRESETS)) {
        throw new Error(`[showcase] 未知的远程技能 id: ${skillId}`)
    }
    return [createSkillSlot(RANGED_SKILL_PRESETS[skillId])]
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

    /* —— 按清单创建展示角色：近战一行（前排）+ 远程一行（后排），全部面向 +Z —— */
    const actors: ShowcaseActor[] = []
    const anchorToActor = new Map<Object3D, ShowcaseActor>()
    let nextFaction = 0

    const placeRow = (kind: 'melee' | 'ranged', rowZ: number, spacing: number): void => {
        const entries = SHOWCASE_ROSTER.filter(e => e.kind === kind)
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            if (entry === undefined) continue
            const slots = resolveSkillSlots(entry.skillId, kind)
            const skillName = displayNameOf(SKILL_DISPLAY_NAMES, entry.skillId)
            const weaponName = displayNameOf(WEAPON_DISPLAY_NAMES, slots[0].config.weapon.id)
            const actor = createShowcaseActor({
                id: actors.length,
                scene: sceneCtx.scene,
                slots,
                faction: nextFaction++,
                x: (i - (entries.length - 1) / 2) * spacing,
                z: rowZ,
                skillName,
                weaponName,
            })
            /* 头顶名称标签（技能名 + 武器名）—— 句柄交给 actor，随其 dispose 统一回收 */
            actor.attachLabel(createNameLabel(skillName, weaponName))
            actors.push(actor)
            anchorToActor.set(actor.anchor, actor)
        }
    }
    placeRow('melee', MELEE_ROW_Z, MELEE_SPACING)
    placeRow('ranged', RANGED_ROW_Z, RANGED_SPACING)

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
    let focusActor: ShowcaseActor | null = null

    const focusVec = new Vector3()
    const setFocus = (next: ShowcaseActor | null): void => {
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

    /* —— 信息面板 —— */
    const panelInfos: PanelRowInfo[] = actors.map(actor => ({
        id: actor.id,
        skillName: actor.skillName,
        weaponName: actor.weaponName,
        colorHex: `#${SELECT_PALETTE(actors.indexOf(actor)).bodyColor.toString(16).padStart(6, '0')}`,
    }))
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
        panel.refresh(actors.map(actor => actor.status()), playing, speed, focusActor?.id ?? null)
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
