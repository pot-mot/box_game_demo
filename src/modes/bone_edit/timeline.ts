import {Quaternion, Vector3} from 'three'
import type {ClipJSON} from '../../skeleton/anim/serialization.ts'
import {createBoneAnimationPlayer} from '../../skeleton/anim/player.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {AnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import {createTimelineControls} from './timeline_controls.ts'
import {setupTrackView} from './timeline_tracks.ts'
import {setupTimelineLibrary} from './timeline_library.ts'
import {createBoneEditWeaponControl, type ClipWeaponSource} from './weapon_control.ts'
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

export type {KeyframeSelection} from './timeline_ops.ts'

/** 时间轴面板对外接口（index/pointer/e2e 使用） */
export interface TimelinePanel {
    readonly container: HTMLElement
    readonly updater: (dt: number) => void
    /** 当前播放头时间（DOM 可测试面：data-playhead-time） */
    readonly playheadTime: number
    /** IK 牵引模式是否开启（指针交互读取） */
    isIkEnabled: () => boolean
    /** 恢复动画库（undo/导入用） */
    applyLibrary: (clips: readonly ClipJSON[], currentName?: string) => void
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
    store: AnimationStore,
    history: BoneEditHistory,
): TimelinePanel => {
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
    const weaponControl = createBoneEditWeaponControl(world)
    controls.bar.appendChild(weaponControl.select)
    controls.bar.appendChild(weaponControl.gripToggle)

    /* ── 状态 ── */
    let pxPerSec = TIMELINE_PX_PER_SEC
    let playhead = 0
    let playing = false
    let ikEnabled = false
    let player: ReturnType<typeof createBoneAnimationPlayer> | undefined
    let selection: KeyframeSelection = new Map()
    let copiedKeyframes: {targetId: string; kind: 'joint' | 'bone'; time: number; data: unknown}[] = []
    /** 动画库中每个 clip 的来源（内置动作载入副本时记录，供「自动」模式选武器） */
    const clipWeaponSource = new Map<string, ClipWeaponSource>()
    /** 上次武器同步键：动画名 + 来源武器/段，避免同一动画重复重装武器 */
    let lastWeaponSyncKey: string | undefined

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
        setPxPerSec: (value) => { pxPerSec = value },
        onScrub: (t) => {
            playhead = t
            player?.seek(t)
        },
        onCurveUpdate: () => curveEditor.update(),
    })
    container.appendChild(trackView.element)

    /* 曲线编辑器容器（选中关键帧时显示） */
    const curveWrap = document.createElement('div')
    curveWrap.style.cssText = 'display:none;flex-shrink:0;border-top:1px solid #333;padding:2px 8px;height:64px'
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
    const onion = setupOnionSkin(world, store, () => playhead)

    /* ── 动画库（下拉 / 导入导出 / undo 恢复）── */
    const library = setupTimelineLibrary({
        store,
        world,
        history,
        container,
        animSelect: controls.animSelect,
        clipWeaponSource,
        runtime,
        getWeaponData: () => ({
            weaponId: weaponControl.currentWeaponId() ?? '',
            twoHanded: weaponControl.isTwoHanded(),
            gripAssist: weaponControl.isGripAssist(),
            gripSolved: weaponControl.isGripSolved(),
        }),
    })

    const playerSpeedRef = {current: 1}

    /** 当前动画来源（「自动」模式据此装备武器） */
    const currentWeaponSource = (): ClipWeaponSource =>
        store.currentName !== undefined ? (clipWeaponSource.get(store.currentName) ?? {}) : {}

    /** 按当前动画来源同步武器（force = 强制重装，如切换聚焦骨架后） */
    const syncWeaponForCurrentClip = (force = false): void => {
        const source = currentWeaponSource()
        const key = `${store.currentName ?? ''}|${source.weaponId ?? ''}|${source.segmentId ?? ''}`
        if (!force && key === lastWeaponSyncKey) return
        lastWeaponSyncKey = key
        weaponControl.syncForClip(source)
    }

    const rebuildPlayer = (): void => {
        player?.pause()
        const clip = store.current
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

    const refreshControls = (): void => {
        const clip = store.current
        controls.loopInput.checked = clip?.loop ?? false
        controls.durationInput.value = String(round(clip?.duration ?? 0))
        controls.speedInput.value = String(playerSpeedRef.current)
        /* 武器：「自动」模式跟随当前动画来源（仅在来源变化时重装，避免每帧重建武器网格） */
        syncWeaponForCurrentClip()
        /* 动画下拉 */
        library.rebuildAnimOptions()
        /* 骨架下拉 */
        controls.skeletonSelect.innerHTML = ''
        for (const entity of world.getEntityList()) {
            const opt = document.createElement('option')
            opt.value = String(entity.id)
            opt.textContent = entity.name
            controls.skeletonSelect.appendChild(opt)
        }
        const focus = world.getFocus()
        controls.skeletonSelect.value = focus !== undefined ? String(focus.id) : ''
    }

    /* ── 关键帧操作 ── */
    const addKeyframeAt = (t: number): void => {
        const clip = store.current
        const skeleton = world.getFocus()?.skeleton
        if (clip === undefined || skeleton === undefined) return
        history.startEdit()
        const targets = selection.size > 0
            ? [...selection.keys()]
            : [...skeleton.joints.keys(), ...skeleton.bones.keys()]
        store.updateCurrent(current => {
            let next = current
            for (const targetId of targets) {
                if (skeleton.findJoint(targetId) !== undefined) {
                    next = upsertJointTrack(next, targetId)
                    const joint = skeleton.findJoint(targetId)!
                    next = {
                        ...next,
                        jointTracks: next.jointTracks.map(track => track.targetId === targetId
                            ? {...track, records: [...track.records.filter(r => r.time !== round(t)), {time: round(t), position: joint.position.clone(), rotation: joint.rotation.clone()}]}
                            : track),
                    }
                } else if (skeleton.findBone(targetId) !== undefined) {
                    next = upsertBoneTrack(next, targetId)
                    const bone = skeleton.findBone(targetId)!
                    next = {
                        ...next,
                        boneTracks: next.boneTracks.map(track => track.targetId === targetId
                            ? {...track, records: [...track.records.filter(r => r.time !== round(t)), {time: round(t), roll: bone.roll}]}
                            : track),
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
    weaponControl.gripToggle.addEventListener('click', () => {
        rebuildPlayer()
        weaponControl.solveGrip()
        refreshControls()
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
        store.createEmpty('动画')
        rebuildPlayer()
        history.endEdit()
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })
    controls.renameAnimBtn.addEventListener('click', () => {
        const name = store.currentName
        if (name === undefined) return
        const next = window.prompt('新动画名：', name)
        if (next === null || next.trim() === '' || next === name) return
        history.startEdit()
        const renameTo = next.trim()
        store.rename(name, renameTo)
        /* 动画改名时同步搬运内置来源记录（供「武器：自动」继续跟随） */
        const source = clipWeaponSource.get(name)
        if (source !== undefined) {
            clipWeaponSource.delete(name)
            clipWeaponSource.set(store.currentName ?? renameTo, source)
        }
        history.endEdit()
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })
    controls.delAnimBtn.addEventListener('click', () => {
        const name = store.currentName
        if (name === undefined) return
        history.startEdit()
        store.remove(name)
        rebuildPlayer()
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
        controls.onionBtn.textContent = onion.isEnabled() ? '洋葱皮开' : '洋葱皮'
    })
    controls.ikBtn.addEventListener('click', () => {
        ikEnabled = !ikEnabled
        controls.ikBtn.textContent = ikEnabled ? 'IK 开' : 'IK 关'
    })
    controls.undoBtn.addEventListener('click', () => history.undo())
    controls.redoBtn.addEventListener('click', () => history.redo())
    controls.exportBtn.addEventListener('click', () => library.exportAsset())
    controls.importBtn.addEventListener('click', () => library.importAsset())
    controls.skeletonSelect.addEventListener('change', () => {
        const id = Number(controls.skeletonSelect.value)
        world.focus(id)
        selection = new Map()
        curveEditor.update()
        /* 聚焦骨架更换：武器需重新挂到新骨架的右手挂点上 */
        syncWeaponForCurrentClip(true)
        rebuildPlayer()
        refreshControls()
        trackView.renderList()
        trackView.renderCanvas()
    })

    /* ── 键盘（面板聚焦时）：Ctrl+Z / Ctrl+Shift+Z / Ctrl+C / Ctrl+V / Delete ── */
    const onKeyDown = (e: KeyboardEvent): void => {
        const target = e.target as HTMLElement | null
        if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
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
        /* 左手贴合：仅在开关打开且双手武器时生效（关闭时为零耦合的空操作）；
         * 放在播放分支之外，保证暂停状态下开启贴合也能立即跟随武器 */
        weaponControl.solveGrip()
        /* DOM 可测试面：播放头时间与武器状态 */
        container.dataset.playheadTime = playhead.toFixed(3)
        container.dataset.weapon = weaponControl.currentWeaponId() ?? ''
        container.dataset.twoHanded = String(weaponControl.isTwoHanded())
        container.dataset.gripAssist = weaponControl.isGripAssist() ? 'on' : 'off'
        container.dataset.gripSolved = String(weaponControl.isGripSolved())
    }

    const edit = (fn: () => void): void => {
        history.startEdit()
        fn()
        history.endEdit()
    }

    /* 初始化：默认动画 */
    if (store.current === undefined) {
        store.createEmpty('动画')
    }
    rebuildPlayer()
    refreshControls()
    trackView.renderList()
    layout()

    return {
        container,
        updater,
        get playheadTime() { return playhead },
        isIkEnabled: () => ikEnabled,
        applyLibrary: library.applyLibrary,
        togglePlay,
        exportAsset: library.exportAsset,
        importAsset: library.importAsset,
        edit,
        destroy: () => {
            player?.pause()
            weaponControl.dispose()
            window.removeEventListener('resize', onResize)
            window.removeEventListener('keydown', onKeyDown)
            curveEditor.dispose()
            onion.clear()
            container.remove()
        },
    }
}
