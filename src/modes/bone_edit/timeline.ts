import {isTextEntryTarget} from '../../input/registry.ts'
import {Quaternion, Vector3} from 'three'
import type {ClipJSON} from '../../skeleton/anim/serialization.ts'
import {createBoneAnimationPlayer} from '../../skeleton/anim/player.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {FormAnimationStores} from './form_store.ts'
import type {BoneEditHistory} from './history.ts'
import {BONE_EDIT_FORM_PROFILES, boneEditFormProfileOf, type BoneEditFormProfile} from './form_catalog.ts'
import {createTimelineControls, normalizeTimelineZoom} from './timeline_controls.ts'
import {setupTrackView} from './timeline_tracks.ts'
import {setupTimelineLibrary} from './timeline_library.ts'
import {createBoneEditWeaponControl, type ClipWeaponSource} from './weapon_control.ts'
import {DEFAULT_HANDEDNESS, isHandedness} from '../../character/handedness.ts'
import {mirrorClip} from '../../skeleton/anim/mirror.ts'
import {captureBoneRoll, captureJointPose, captureSourceId} from './mirror_capture.ts'
import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'
import {round, upsertJointTrack, upsertBoneTrack, type KeyframeSelection, type TimelineRuntime} from './timeline_ops.ts'
import {setupCurveEditor} from './curve_editor.ts'
import {setupOnionSkin} from './onion_skin.ts'
import {
    ANIM_OPTION_BUILTIN_PREFIX,
    ANIM_OPTION_EDITED_PREFIX,
    TIMELINE_BG,
    TIMELINE_HEIGHT,
    TIMELINE_PX_PER_SEC,
    TIMELINE_LABEL,
} from './constants.ts'
import {onLocaleChange, translate} from '../../i18n/index.ts'
import {localizeApply} from '../../i18n/dom.ts'

export type {KeyframeSelection} from './timeline_ops.ts'

/** 时间轴主装配需要外壳提供的回调（体形切换涉及相机/骨架装配） */
export interface TimelineHost {
    readonly onFormChange: (formId: string) => void
}

/** 时间轴面板对外接口（index/pointer/测试使用） */
export interface TimelinePanel {
    readonly container: HTMLElement
    readonly updater: (dt: number) => void
    /** 当前播放头时间（DOM 可测试面：data-playhead-time） */
    readonly playheadTime: number
    /** 恢复动画库（undo/导入用） */
    applyLibrary: (clips: readonly ClipJSON[], currentName?: string) => void
    /** 切换体形：切换独立动画库 */
    setForm: (formId: string) => void
    togglePlay: () => void
    /** 导出/导入资产 */
    exportAsset: () => void
    importAsset: () => void
    destroy: () => void
    /** 编辑操作统一入口（供历史记录包装） */
    edit: (fn: () => void) => void
}

/** 时间轴面板装配：控制条（timeline_controls）+ 轨道视图（timeline_tracks）+ 动画库（timeline_library）
 *  + 曲线编辑器（curve_editor）+ 洋葱皮（onion_skin），主装配只负责状态与事件接线。 */
export const setupTimelinePanel = (
    world: SkeletonEntitiesContext,
    stores: FormAnimationStores,
    history: BoneEditHistory,
    host: TimelineHost,
): TimelinePanel => {
    const store = stores.store
    const container = document.createElement('div')
    container.id = 'bone-timeline'
    container.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:120;background:${TIMELINE_BG};display:flex;flex-direction:column;font:12px system-ui,sans-serif;color:${TIMELINE_LABEL};height:${TIMELINE_HEIGHT}px`
    document.body.appendChild(container)

    /* 布局回调：控制条拖拽顶边后调用（在轨道视图创建后赋值） */
    let layout: () => void = () => {}
    const controls = createTimelineControls(container, TIMELINE_HEIGHT, (height) => {
        container.style.height = `${height}px`
        layout()
    })

    /* ── 武器控制（自动跟随动画来源 / 手动覆盖；双手贴合开关，默认关）── */
    const weaponControl = createBoneEditWeaponControl(
        world,
        () => stores.activeFormId,
        () => boneEditFormProfileOf(stores.activeFormId).defaultWeaponId,
    )
    controls.bar.appendChild(weaponControl.select)

    for (const profile of BONE_EDIT_FORM_PROFILES) {
        const option = document.createElement('option')
        option.value = profile.formId
        localizeApply(option, el => { el.textContent = translate(profile.form.nameKey) })
        controls.formSelect.appendChild(option)
    }
    controls.formSelect.value = stores.activeFormId

    /* ── 状态 ── */
    let pxPerSec = TIMELINE_PX_PER_SEC
    controls.zoomInput.value = String(Math.round(pxPerSec))
    let playhead = 0
    let playing = false
    let player: ReturnType<typeof createBoneAnimationPlayer> | undefined
    let selection: KeyframeSelection = new Map()
    let copiedKeyframes: {targetId: string; kind: 'joint' | 'bone'; time: number; data: unknown}[] = []
    /** 每体形动画库中每个 clip 的来源（内置动作载入副本时记录，供「自动」模式选武器） */
    const clipWeaponSources = new Map<string, Map<string, ClipWeaponSource>>()
    const currentClipWeaponSources = (): Map<string, ClipWeaponSource> => {
        const formId = stores.activeFormId
        const existing = clipWeaponSources.get(formId)
        if (existing !== undefined) return existing
        const created = new Map<string, ClipWeaponSource>()
        clipWeaponSources.set(formId, created)
        return created
    }
    /** 上次武器同步键：动画名 + 来源武器/段，避免同一动画重复重装武器 */
    let lastWeaponSyncKey: string | undefined

    const activeProfile = (): BoneEditFormProfile => boneEditFormProfileOf(stores.activeFormId)

    /* 运行期回调槽：子模块在事件回调中经它调用主装配操作，避免循环依赖 */
    const runtime: TimelineRuntime = {
        rebuildPlayer: () => {},
        refreshControls: () => {},
        renderList: () => {},
        renderCanvas: () => {},
        addKeyframeAt: () => {},
        syncWeaponForCurrentClip: () => {},
    }

    /* ── 轨道视图（左侧列表 + canvas 时间轴）── */
    const trackView = setupTrackView({
        store,
        world,
        history,
        runtime,
        getSelection: () => selection,
        setSelection: (next) => { selection = next },
        getPlayhead: () => playhead,
        getPxPerSec: () => pxPerSec,
        setPxPerSec: (value) => {
            pxPerSec = value
            controls.zoomInput.value = String(Math.round(value))
        },
        onScrub: (t) => {
            playhead = t
            player?.seek(t)
        },
        onCurveUpdate: () => curveEditor.update(),
    })
    container.appendChild(trackView.element)

    /* 曲线编辑器容器（选中关键帧时显示） */
    const curveWrap = document.createElement('div')
    curveWrap.style.cssText = 'display:none;flex-shrink:0;border-top:1px solid var(--dc-border);padding:2px 8px;height:64px'
    container.appendChild(curveWrap)
    const curveCanvas = document.createElement('canvas')
    curveCanvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair'
    curveWrap.appendChild(curveCanvas)

    const curveEditor = setupCurveEditor({
        wrap: curveWrap,
        canvas: curveCanvas,
        store,
        getSelection: () => selection,
        history,
    })
    const onion = setupOnionSkin(world, () => previewClip(store.current), () => playhead)

    /* 洋葱皮为开合切换按钮：登记计算型本地化，语言切换时按当前开关状态重译（不覆盖开合态） */
    localizeApply(controls.onionBtn, el => {
        el.textContent = translate(onion.isEnabled() ? 'bone_edit.timeline.onion_on' : 'bone_edit.timeline.onion_off')
    })

    /* ── 动画库（下拉 / 导入导出 / undo 恢复）── */
    const library = setupTimelineLibrary({
        store,
        world,
        history,
        container,
        animSelect: controls.animSelect,
        getClipWeaponSource: currentClipWeaponSources,
        runtime,
        getWeaponData: () => ({
            weaponId: weaponControl.currentWeaponId() ?? '',
            twoHanded: weaponControl.isTwoHanded(),
        }),
        getFormId: () => stores.activeFormId,
    })

    const playerSpeedRef = {current: 1}

    /** 当前动画来源（「自动」模式据此装备武器） */
    const currentWeaponSource = (): ClipWeaponSource =>
        store.currentName !== undefined ? (currentClipWeaponSources().get(store.currentName) ?? {}) : {}

    /** 按当前动画来源同步武器（force = 强制重装，如切换聚焦骨架后） */
    const syncWeaponForCurrentClip = (force = false): void => {
        weaponControl.setEnabled(true)
        const source = currentWeaponSource()
        const key = `${store.currentName ?? ''}|${source.weaponId ?? ''}|${source.segmentId ?? ''}`
        if (!force && key === lastWeaponSyncKey) return
        lastWeaponSyncKey = key
        weaponControl.syncForClip(source)
    }

    /** 预览用 clip：仅人形支持惯用手镜像；其他体形原样返回 */
    const previewClip = (clip: BoneAnimationClip | undefined): BoneAnimationClip | undefined =>
        clip === undefined
            ? undefined
            : (activeProfile().supportsHandedness && weaponControl.getHandedness() === 'left' ? mirrorClip(clip) : clip)

    const rebuildPlayer = (): void => {
        player?.pause()
        const clip = previewClip(store.current)
        const skeleton = world.getFocus()?.skeleton
        if (clip === undefined || skeleton === undefined) {
            player = undefined
            return
        }
        player = createBoneAnimationPlayer(skeleton, clip)
        player.setSpeed(playerSpeedRef.current)
        player.seek(Math.min(playhead, clip.duration))
        if (playing) player.play()
        /* 注意：此处不求解左手贴合 —— 暂停/拖动播放头属于编辑状态，两只手必须互不牵扯；
         * 贴合只在播放预览的每帧（updater）且开关打开时进行 */
    }

    const applyModeVisibility = (): void => {
        const profile = activeProfile()
        weaponControl.select.style.display = profile.supportsWeaponControl ? '' : 'none'
        weaponControl.setEnabled(profile.supportsWeaponControl)
        controls.handednessLabel.style.display = profile.supportsHandedness ? '' : 'none'
        controls.handednessSelect.style.display = profile.supportsHandedness ? '' : 'none'
        trackView.setVisible(true)
        curveEditor.update()
    }

    const refreshControls = (): void => {
        const clip = store.current
        controls.loopInput.checked = clip?.loop ?? false
        controls.durationInput.value = String(round(clip?.duration ?? 0))
        controls.speedInput.value = String(playerSpeedRef.current)
        controls.formSelect.value = stores.activeFormId
        applyModeVisibility()
        /* 武器：「自动」模式跟随当前动画来源（仅在来源变化时重装，避免每帧重建武器网格） */
        syncWeaponForCurrentClip()
        library.rebuildAnimOptions()
    }

    const setForm = (formId: string): void => {
        stores.setActive(formId)
        lastWeaponSyncKey = undefined
        player?.pause()
        playing = false
        playhead = 0
        selection = new Map()
        curveEditor.update()
        if (store.current === undefined) store.createEmpty(translate('bone_edit.timeline.default_clip_name'))
        refreshControls()
        rebuildPlayer()
        trackView.renderList()
        trackView.renderCanvas()
        onion.update()
    }

    /* ── 关键帧操作 ── */
    const addKeyframeAt = (t: number): void => {
        const clip = store.current
        const skeleton = world.getFocus()?.skeleton
        if (clip === undefined || skeleton === undefined) return
        history.startEdit()
        /* 写入的 canonical 轨道 id：左撇子预览下骨架关节 id 承载的是镜像轨道，故需先映射回 canonical。
         * 读取关节与姿势反射由 mirror_capture 统一处理（见其说明）。 */
        const mirrored = weaponControl.getHandedness() === 'left'
        const canonicalIds = selection.size > 0
            ? [...selection.keys()]
            : [...skeleton.joints.keys(), ...skeleton.bones.keys()].map(id => captureSourceId(id, mirrored))
        store.updateCurrent(current => {
            let next = current
            for (const writeId of canonicalIds) {
                const readId = captureSourceId(writeId, mirrored)
                const joint = skeleton.findJoint(readId)
                if (joint !== undefined) {
                    next = upsertJointTrack(next, writeId)
                    const pose = captureJointPose(joint.position, joint.rotation, mirrored)
                    next = {
                        ...next,
                        jointTracks: next.jointTracks.map(track => track.targetId === writeId
                            ? {...track, records: [...track.records.filter(r => r.time !== round(t)), {time: round(t), position: pose.position, rotation: pose.rotation}]}
                            : track),
                    }
                    continue
                }
                const bone = skeleton.findBone(readId)
                if (bone === undefined) continue
                next = upsertBoneTrack(next, writeId)
                next = {
                    ...next,
                    boneTracks: next.boneTracks.map(track => track.targetId === writeId
                        ? {...track, records: [...track.records.filter(r => r.time !== round(t)), {time: round(t), roll: captureBoneRoll(bone.roll, mirrored)}]}
                        : track),
                }
            }
            return next
        })
        rebuildPlayer()
        history.endEdit()
        trackView.renderList()
        trackView.renderCanvas()
    }

    const addEventAt = (t: number): void => {
        const clip = store.current
        if (clip === undefined) return
        history.startEdit()
        store.updateCurrent(current => {
            const records = current.eventTracks[0]?.records ?? []
            return {
                ...current,
                eventTracks: [{
                    records: [...records.filter(r => r.time !== round(t)), {time: round(t), eventName: 'hitbox_on'}],
                }],
            }
        })
        history.endEdit()
        trackView.renderList()
        trackView.renderCanvas()
    }

    const deleteSelection = (): void => {
        const clip = store.current
        if (clip === undefined || selection.size === 0) return
        history.startEdit()
        store.updateCurrent(current => {
            let next = current
            for (const [targetId, times] of selection) {
                if (targetId === '__events__') {
                    next = {...next, eventTracks: next.eventTracks.map(track => ({
                        records: track.records.filter(r => !times.has(r.time)),
                    }))}
                    continue
                }
                if (next.jointTracks.some(t => t.targetId === targetId)) {
                    next = {...next, jointTracks: next.jointTracks.map(t => t.targetId === targetId
                        ? {...t, records: t.records.filter(r => !times.has(r.time))}
                        : t)}
                } else {
                    next = {...next, boneTracks: next.boneTracks.map(t => t.targetId === targetId
                        ? {...t, records: t.records.filter(r => !times.has(r.time))}
                        : t)}
                }
            }
            return next
        })
        selection = new Map()
        history.endEdit()
        trackView.renderList()
        trackView.renderCanvas()
    }

    /* 复制/粘贴 */
    const copySelection = (): void => {
        const clip = store.current
        if (clip === undefined) return
        copiedKeyframes = []
        for (const [targetId, times] of selection) {
            for (const time of times) {
                if (targetId === '__events__') continue
                const jointTrack = clip.jointTracks.find(t => t.targetId === targetId)
                const boneTrack = clip.boneTracks.find(t => t.targetId === targetId)
                const record = jointTrack?.records.find(r => r.time === time)
                if (record !== undefined) {
                    copiedKeyframes.push({targetId, kind: 'joint', time, data: {position: record.position.toArray(), rotation: record.rotation.toArray()}})
                    continue
                }
                const boneRecord = boneTrack?.records.find(r => r.time === time)
                if (boneRecord !== undefined) {
                    copiedKeyframes.push({targetId, kind: 'bone', time, data: {roll: boneRecord.roll}})
                }
            }
        }
    }

    const pasteClipboard = (): void => {
        const clip = store.current
        const skeleton = world.getFocus()?.skeleton
        if (clip === undefined || skeleton === undefined || copiedKeyframes.length === 0) return
        history.startEdit()
        store.updateCurrent(current => {
            let next = current
            for (const item of copiedKeyframes) {
                if (item.kind === 'joint' && skeleton.findJoint(item.targetId) !== undefined) {
                    next = upsertJointTrack(next, item.targetId)
                    const data = item.data as {position: number[]; rotation: number[]}
                    const targetTime = round(playhead)
                    next = {
                        ...next,
                        jointTracks: next.jointTracks.map(t => t.targetId === item.targetId
                            ? {...t, records: [...t.records.filter(r => r.time !== targetTime), {time: targetTime, position: new Vector3().fromArray(data.position), rotation: new Quaternion().fromArray(data.rotation)}]}
                            : t),
                    }
                } else if (item.kind === 'bone' && skeleton.findBone(item.targetId) !== undefined) {
                    next = upsertBoneTrack(next, item.targetId)
                    const data = item.data as {roll: number}
                    const targetTime = round(playhead)
                    next = {
                        ...next,
                        boneTracks: next.boneTracks.map(t => t.targetId === item.targetId
                            ? {...t, records: [...t.records.filter(r => r.time !== targetTime), {time: targetTime, roll: data.roll}]}
                            : t),
                    }
                }
            }
            return next
        })
        rebuildPlayer()
        history.endEdit()
        trackView.renderList()
        trackView.renderCanvas()
    }

    /* 填充运行期回调槽（此后子模块事件可调用主装配操作） */
    runtime.rebuildPlayer = rebuildPlayer
    runtime.refreshControls = refreshControls
    runtime.renderList = trackView.renderList
    runtime.renderCanvas = trackView.renderCanvas
    runtime.addKeyframeAt = addKeyframeAt
    runtime.syncWeaponForCurrentClip = syncWeaponForCurrentClip

    /* ── 播放控制 ── */
    const togglePlay = (): void => {
        if (player === undefined) return
        if (player.isPlaying) player.pause()
        else player.play()
    }

    /* ── 控制条事件接线 ── */
    controls.formSelect.addEventListener('change', () => host.onFormChange(controls.formSelect.value))
    controls.playBtn.addEventListener('click', togglePlay)
    controls.stopBtn.addEventListener('click', () => {
        player?.stop()
        playhead = 0
        trackView.renderCanvas()
    })
    controls.loopInput.addEventListener('change', () => {
        history.startEdit()
        store.updateMeta({loop: controls.loopInput.checked})
        rebuildPlayer()
        history.endEdit()
    })
    controls.durationInput.addEventListener('change', () => {
        const v = parseFloat(controls.durationInput.value)
        if (Number.isNaN(v) || v <= 0) return
        history.startEdit()
        store.updateMeta({duration: v})
        rebuildPlayer()
        history.endEdit()
    })
    controls.speedInput.addEventListener('change', () => {
        const v = parseFloat(controls.speedInput.value)
        if (!Number.isNaN(v)) {
            player?.setSpeed(v)
            playerSpeedRef.current = v
        }
    })
    controls.zoomInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        const next = normalizeTimelineZoom(controls.zoomInput.value)
        if (next === undefined) {
            controls.zoomInput.value = String(Math.round(pxPerSec))
            return
        }
        pxPerSec = next
        controls.zoomInput.value = String(Math.round(next))
        trackView.renderCanvas()
    })
    controls.animSelect.addEventListener('change', () => {
        const value = controls.animSelect.value
        history.startEdit()
        if (value.startsWith(ANIM_OPTION_BUILTIN_PREFIX)) {
            library.selectBuiltinClip(value.slice(ANIM_OPTION_BUILTIN_PREFIX.length))
        } else {
            store.select(value.slice(ANIM_OPTION_EDITED_PREFIX.length))
        }
        /* 切换动画后播放头归零，避免沿用上一条动画的时间点 */
        playhead = 0
        rebuildPlayer()
        history.endEdit()
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })
    controls.newAnimBtn.addEventListener('click', () => {
        history.startEdit()
        store.createEmpty(translate('bone_edit.timeline.default_clip_name'))
        rebuildPlayer()
        history.endEdit()
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })
    controls.renameAnimBtn.addEventListener('click', () => {
        const name = store.currentName
        if (name === undefined) return
        const next = window.prompt(translate('bone_edit.timeline.rename_prompt'), name)
        if (next === null || next.trim() === '' || next === name) return
        history.startEdit()
        const renameTo = next.trim()
        store.rename(name, renameTo)
        /* 动画改名时同步搬运内置来源记录（供「武器：自动」继续跟随） */
        const sources = currentClipWeaponSources()
        const source = sources.get(name)
        if (source !== undefined) {
            sources.delete(name)
            sources.set(store.currentName ?? renameTo, source)
        }
        history.endEdit()
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })
    controls.addKeyBtn.addEventListener('click', () => addKeyframeAt(playhead))
    controls.addEventBtn.addEventListener('click', () => addEventAt(playhead))
    controls.delKeyBtn.addEventListener('click', deleteSelection)
    controls.copyBtn.addEventListener('click', copySelection)
    controls.pasteBtn.addEventListener('click', pasteClipboard)
    controls.onionBtn.addEventListener('click', () => {
        onion.toggle()
        controls.onionBtn.textContent = translate(onion.isEnabled() ? 'bone_edit.timeline.onion_on' : 'bone_edit.timeline.onion_off')
    })
    controls.undoBtn.addEventListener('click', () => history.undo())
    controls.redoBtn.addEventListener('click', () => history.redo())
    controls.exportBtn.addEventListener('click', () => library.exportAsset())
    controls.importBtn.addEventListener('click', () => library.importAsset())
    /* 惯用手预览：左撇子 = 播放时镜像 clip + 武器改挂副手挂点 + 双手 IK 支撑换侧；canonical 动作数据（存档）不变 */
    controls.handednessSelect.addEventListener('change', () => {
        if (!activeProfile().supportsHandedness) return
        const value = controls.handednessSelect.value
        weaponControl.setHandedness(isHandedness(value) ? value : DEFAULT_HANDEDNESS)
        rebuildPlayer()
        onion.update()
    })

    /* ── 键盘（面板聚焦时）：Ctrl+Z / Ctrl+Shift+Z / Ctrl+C / Ctrl+V / Delete ── */
    const onKeyDown = (e: KeyboardEvent): void => {
        if (isTextEntryTarget(e.target)) return
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault()
            if (e.shiftKey) history.redo()
            else history.undo()
            return
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'c') {
            e.preventDefault()
            copySelection()
            return
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            pasteClipboard()
            return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteSelection()
        }
    }
    window.addEventListener('keydown', onKeyDown)

    /* ── 布局/尺寸 ── */
    layout = (): void => {
        trackView.resize()
    }
    const onResize = (): void => {
        layout()
    }
    window.addEventListener('resize', onResize)

    /* ── updater ── */
    const updater = (dt: number): void => {
        if (player !== undefined && player.isPlaying) {
            player.updater(dt)
            playhead = player.time
            onion.update()
            trackView.renderCanvas()
        }
        /* DOM 可测试面：播放头时间与武器状态 */
        container.dataset.playheadTime = playhead.toFixed(3)
        container.dataset.form = stores.activeFormId
        container.dataset.weapon = weaponControl.currentWeaponId() ?? ''
        container.dataset.twoHanded = String(weaponControl.isTwoHanded())
        container.dataset.handedness = weaponControl.getHandedness()
    }

    const edit = (fn: () => void): void => {
        history.startEdit()
        fn()
        history.endEdit()
    }

    /* 初始化：默认动画 */
    container.dataset.form = stores.activeFormId
    if (store.current === undefined) {
        store.createEmpty(translate('bone_edit.timeline.default_clip_name'))
    }
    rebuildPlayer()
    refreshControls()
    trackView.renderList()
    layout()

    /* 函数动作名/状态等动态文案随语言切换重译（静态控件由 localizeText 注册） */
    const offLocaleChange = onLocaleChange(() => {
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })

    return {
        container,
        updater,
        get playheadTime() { return playhead },
        applyLibrary: library.applyLibrary,
        setForm,
        togglePlay,
        exportAsset: library.exportAsset,
        importAsset: library.importAsset,
        edit,
        destroy: () => {
            player?.pause()
            weaponControl.dispose()
            offLocaleChange()
            window.removeEventListener('resize', onResize)
            window.removeEventListener('keydown', onKeyDown)
            curveEditor.dispose()
            onion.clear()
            container.remove()
        },
    }
}
