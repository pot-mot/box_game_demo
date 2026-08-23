import {BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointTrack, BoneSegmentTrack} from '../../skeleton/anim/types.ts'
import type {ClipJSON} from '../../skeleton/anim/serialization.ts'
import {clipToJSON, clipFromJSON, skeletonToDefinition, parseAsset} from '../../skeleton/anim/serialization.ts'
import {createBoneAnimationPlayer} from '../../skeleton/anim/player.ts'
import {sampleClip} from '../../skeleton/anim/sampling.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {AnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import {setupTimelineCanvas, type TimelineCanvasTrack} from './timeline_canvas.ts'
import {
    ONION_SKIN_JOINT_SIZE,
    ONION_SKIN_STEP,
    TIMELINE_BG,
    TIMELINE_HEIGHT,
    TIMELINE_MAX_HEIGHT,
    TIMELINE_MAX_PX_PER_SEC,
    TIMELINE_MIN_HEIGHT,
    TIMELINE_MIN_PX_PER_SEC,
    TIMELINE_PX_PER_SEC,
    TIMELINE_LABEL,
    TRACK_LIST_WIDTH,
    TRACK_ROW_HEIGHT,
} from './constants.ts'

/** 选中关键帧集合：targetId → 时间点集合 */
export type KeyframeSelection = ReadonlyMap<string, ReadonlySet<number>>

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

const round = (v: number): number => Math.round(v * 1000) / 1000

const upsertJointTrack = (clip: BoneAnimationClip, targetId: string): BoneAnimationClip => {
    if (clip.jointTracks.some(t => t.targetId === targetId)) return clip
    return {
        ...clip,
        jointTracks: [...clip.jointTracks, {
            targetId,
            interpolation: {type: 'bezier_quad', strategy: 'none'},
            records: [],
        }],
    }
}

const upsertBoneTrack = (clip: BoneAnimationClip, targetId: string): BoneAnimationClip => {
    if (clip.boneTracks.some(t => t.targetId === targetId)) return clip
    return {
        ...clip,
        boneTracks: [...clip.boneTracks, {
            targetId,
            interpolation: {type: 'bezier_quad', strategy: 'none'},
            records: [],
        }],
    }
}

/** 时间轴面板装配（DOM 轨道列表 + canvas 时间轴 + 控制条 + 曲线编辑器 + 洋葱皮） */
export const setupTimelinePanel = (
    world: SkeletonEntitiesContext,
    store: AnimationStore,
    history: BoneEditHistory,
): TimelinePanel => {
    const container = document.createElement('div')
    container.id = 'bone-timeline'
    container.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:120;background:${TIMELINE_BG};display:flex;flex-direction:column;font:12px system-ui,sans-serif;color:${TIMELINE_LABEL};height:${TIMELINE_HEIGHT}px`
    document.body.appendChild(container)

    let panelHeight = TIMELINE_HEIGHT
    const applyPanelHeight = (): void => {
        container.style.height = `${panelHeight}px`
        layout()
    }

    /* ── 拖拽手柄（可折叠/调高） ── */
    const handle = document.createElement('div')
    handle.style.cssText = 'height:6px;cursor:ns-resize;background:#333;flex-shrink:0'
    handle.title = '拖拽调节高度'
    container.appendChild(handle)

    let dragHandleY = 0
    let dragHandleStart = 0
    handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault()
        dragHandleY = e.clientY
        dragHandleStart = panelHeight
        const onMove = (ev: MouseEvent): void => {
            panelHeight = Math.max(TIMELINE_MIN_HEIGHT, Math.min(TIMELINE_MAX_HEIGHT, dragHandleStart + (dragHandleY - ev.clientY)))
            applyPanelHeight()
        }
        const onUp = (): void => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    })

    /* ── 控制条 ── */
    const controls = document.createElement('div')
    controls.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;flex-shrink:0;flex-wrap:wrap'
    container.appendChild(controls)

    const makeButton = (label: string, title = ''): HTMLButtonElement => {
        const b = document.createElement('button')
        b.textContent = label
        b.title = title
        b.style.cssText = 'padding:2px 8px;cursor:pointer;background:#2a2a33;color:#ddd;border:1px solid #444;border-radius:3px'
        return b
    }

    const playBtn = makeButton('▶', '播放/暂停')
    const stopBtn = makeButton('■', '停止')
    const loopCheck = document.createElement('label')
    loopCheck.textContent = '循环 '
    const loopInput = document.createElement('input')
    loopInput.type = 'checkbox'
    loopCheck.appendChild(loopInput)

    const animSelect = document.createElement('select')
    animSelect.style.cssText = 'max-width:160px'
    const newAnimBtn = makeButton('+动画')
    const delAnimBtn = makeButton('−动画')
    const renameAnimBtn = makeButton('改名')

    const durationInput = document.createElement('input')
    durationInput.type = 'number'
    durationInput.step = '0.01'
    durationInput.min = '0.01'
    durationInput.style.width = '60px'
    const speedInput = document.createElement('input')
    speedInput.type = 'number'
    speedInput.step = '0.1'
    speedInput.min = '0'
    speedInput.style.width = '50px'

    const addKeyBtn = makeButton('+关键帧', '把当前姿态记录到播放头时间（选中目标或全部）')
    const addEventBtn = makeButton('+事件', '在播放头时间插入事件（默认 hitbox_on）')
    const delKeyBtn = makeButton('−关键帧', '删除选中关键帧')
    const copyBtn = makeButton('复制')
    const pasteBtn = makeButton('粘贴')
    const onionBtn = makeButton('洋葱皮')
    const ikBtn = makeButton('IK 关', 'IK 牵引模式切换')
    const undoBtn = makeButton('↶')
    const redoBtn = makeButton('↷')
    const exportBtn = makeButton('导出')
    const importBtn = makeButton('导入')

    /* 骨架聚焦下拉 */
    const skeletonSelect = document.createElement('select')
    skeletonSelect.style.cssText = 'max-width:140px'

    controls.appendChild(playBtn)
    controls.appendChild(stopBtn)
    controls.appendChild(loopCheck)
    controls.appendChild(animSelect)
    controls.appendChild(newAnimBtn)
    controls.appendChild(renameAnimBtn)
    controls.appendChild(delAnimBtn)
    controls.appendChild(document.createTextNode('时长'))
    controls.appendChild(durationInput)
    controls.appendChild(document.createTextNode('速度'))
    controls.appendChild(speedInput)
    controls.appendChild(addKeyBtn)
    controls.appendChild(addEventBtn)
    controls.appendChild(delKeyBtn)
    controls.appendChild(copyBtn)
    controls.appendChild(pasteBtn)
    controls.appendChild(onionBtn)
    controls.appendChild(ikBtn)
    controls.appendChild(undoBtn)
    controls.appendChild(redoBtn)
    controls.appendChild(exportBtn)
    controls.appendChild(importBtn)
    controls.appendChild(document.createTextNode('骨架'))
    controls.appendChild(skeletonSelect)

    /* ── 轨道区（左侧列表 + canvas） ── */
    const trackArea = document.createElement('div')
    trackArea.style.cssText = 'display:flex;flex:1;min-height:0'
    container.appendChild(trackArea)

    const trackList = document.createElement('div')
    trackList.style.cssText = `width:${TRACK_LIST_WIDTH}px;overflow-y:auto;background:#1f1f27;border-right:1px solid #333;flex-shrink:0`
    trackArea.appendChild(trackList)

    const canvasWrap = document.createElement('div')
    canvasWrap.style.cssText = 'flex:1;min-width:0;position:relative'
    trackArea.appendChild(canvasWrap)

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair'
    canvas.tabIndex = 0
    canvasWrap.appendChild(canvas)

    /* 曲线编辑器容器（选中关键帧时显示） */
    const curveWrap = document.createElement('div')
    curveWrap.style.cssText = 'display:none;flex-shrink:0;border-top:1px solid #333;padding:2px 8px;height:64px'
    container.appendChild(curveWrap)
    const curveCanvas = document.createElement('canvas')
    curveCanvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair'
    curveWrap.appendChild(curveCanvas)

    /* ── 状态 ── */
    let pxPerSec = TIMELINE_PX_PER_SEC
    let playhead = 0
    let playing = false
    let onionEnabled = false
    let ikEnabled = false
    let player: ReturnType<typeof createBoneAnimationPlayer> | undefined
    let selection: KeyframeSelection = new Map()
    let copiedKeyframes: {targetId: string; kind: 'joint' | 'bone'; time: number; data: unknown}[] = []
    let onionGroup: {root: Group; joints: Map<string, Group>} | undefined

    const playerSpeedRef = {current: 1}

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
    }

    const refreshControls = (): void => {
        const clip = store.current
        loopInput.checked = clip?.loop ?? false
        durationInput.value = String(round(clip?.duration ?? 0))
        speedInput.value = String(playerSpeedRef.current)
        /* 动画下拉 */
        animSelect.innerHTML = ''
        for (const name of store.clips.keys()) {
            const opt = document.createElement('option')
            opt.value = name
            opt.textContent = name
            animSelect.appendChild(opt)
        }
        animSelect.value = store.currentName ?? ''
        /* 骨架下拉 */
        skeletonSelect.innerHTML = ''
        for (const entity of world.getEntityList()) {
            const opt = document.createElement('option')
            opt.value = String(entity.id)
            opt.textContent = entity.name
            skeletonSelect.appendChild(opt)
        }
        const focus = world.getFocus()
        skeletonSelect.value = focus !== undefined ? String(focus.id) : ''
    }

    /* 轨道行数据（canvas 模型） */
    const buildTracks = (): readonly TimelineCanvasTrack[] => {
        const clip = store.current
        const skeleton = world.getFocus()?.skeleton
        const tracks: TimelineCanvasTrack[] = []
        if (clip === undefined || skeleton === undefined) return tracks
        for (const joint of skeleton.joints.values()) {
            const track = clip.jointTracks.find(t => t.targetId === joint.id)
            tracks.push({
                targetId: joint.id,
                kind: 'joint',
                keyframes: (track?.records ?? []).map(r => ({time: r.time, selected: selection.get(joint.id)?.has(r.time) ?? false})),
            })
        }
        for (const bone of skeleton.bones.values()) {
            const track = clip.boneTracks.find(t => t.targetId === bone.id)
            tracks.push({
                targetId: bone.id,
                kind: 'bone',
                keyframes: (track?.records ?? []).map(r => ({time: r.time, selected: selection.get(bone.id)?.has(r.time) ?? false})),
            })
        }
        for (const track of clip.eventTracks) {
            tracks.push({
                targetId: '__events__',
                kind: 'event',
                keyframes: track.records.map(r => ({time: r.time, selected: selection.get('__events__')?.has(r.time) ?? false})),
            })
        }
        return tracks
    }

    const renderTrackList = (): void => {
        trackList.innerHTML = ''
        const clip = store.current
        const tracks = buildTracks()
        for (const track of tracks) {
            const row = document.createElement('div')
            row.style.cssText = `height:${TRACK_ROW_HEIGHT}px;display:flex;align-items:center;gap:4px;padding:0 4px;border-bottom:1px solid #2a2a33`
            row.dataset.trackTarget = track.targetId
            const label = document.createElement('span')
            label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
            label.textContent = track.targetId
            row.appendChild(label)

            const count = document.createElement('span')
            count.style.cssText = 'color:#889;min-width:18px;text-align:right'
            count.dataset.keyframeCount = String(track.keyframes.length)
            count.textContent = String(track.keyframes.length)
            row.appendChild(count)

            if (track.kind !== 'event' && clip !== undefined) {
                const interp = document.createElement('select')
                interp.style.cssText = 'width:84px;font-size:10px'
                const options: readonly (readonly [string, string])[] = [
                    ['linear_none', '线性'],
                    ['bezier_none', '线性(贝)'],
                    ['bezier_ease_in', '先慢后快'],
                    ['bezier_ease_out', '先快后慢'],
                    ['bezier_strike_peak', '末端加速'],
                ]
                for (const [value, labelText] of options) {
                    const opt = document.createElement('option')
                    opt.value = value
                    opt.textContent = labelText
                    interp.appendChild(opt)
                }
                const jointTrack = track.kind === 'joint' ? clip.jointTracks.find(t => t.targetId === track.targetId) : undefined
                const boneTrack = track.kind === 'bone' ? clip.boneTracks.find(t => t.targetId === track.targetId) : undefined
                const spec = jointTrack?.interpolation ?? boneTrack?.interpolation
                interp.value = spec !== undefined ? `${spec.type}_${spec.strategy}` : 'bezier_none'
                interp.addEventListener('change', () => {
                    const parts = interp.value.split('_') as [string, string]
                    const type = parts[0] === 'linear' ? 'linear' : 'bezier_quad'
                    const strategy = parts[1] as 'none' | 'ease_in' | 'ease_out' | 'strike_peak'
                    history.startEdit()
                    store.updateCurrent(current => {
                        const patchJoint = (t: BoneJointTrack): BoneJointTrack => ({...t, interpolation: {type, strategy}})
                        const patchBone = (t: BoneSegmentTrack): BoneSegmentTrack => ({...t, interpolation: {type, strategy}})
                        return {
                            ...current,
                            jointTracks: track.kind === 'joint' ? current.jointTracks.map(t => t.targetId === track.targetId ? patchJoint(t) : t) : current.jointTracks,
                            boneTracks: track.kind === 'bone' ? current.boneTracks.map(t => t.targetId === track.targetId ? patchBone(t) : t) : current.boneTracks,
                        }
                    })
                    rebuildPlayer()
                    history.endEdit()
                    renderTrackList()
                    canvasModel.render()
                })
                row.appendChild(interp)
            }
            trackList.appendChild(row)
        }
    }

    /* ── canvas 模型回调 ── */
    const canvasModel = setupTimelineCanvas(canvas, {
        get pxPerSec() { return pxPerSec },
        get duration() { return store.current?.duration ?? 0 },
        get playhead() { return playhead },
        get tracks() { return buildTracks() },
        onScrub: (t) => {
            playhead = t
            player?.seek(t)
            canvasModel.render()
        },
        onSelectKeyframe: (targetId, time, additive) => {
            const next = new Map(selection)
            const set = new Set(next.get(targetId) ?? [])
            if (additive) {
                if (set.has(time)) set.delete(time)
                else set.add(time)
            } else {
                next.clear()
                set.add(time)
            }
            next.set(targetId, set)
            selection = next
            updateCurveEditor()
            canvasModel.render()
            renderTrackList()
        },
        onDragKeyframe: (targetId, oldTime, newTime) => {
            history.startEdit()
            const t = Math.max(0, newTime)
            store.updateCurrent(clip => {
                if (targetId === '__events__') {
                    return {
                        ...clip,
                        eventTracks: clip.eventTracks.map(track => ({
                            records: track.records.map(r => r.time === oldTime ? {...r, time: t} : r),
                        })),
                    }
                }
                if (clip.jointTracks.some(track => track.targetId === targetId)) {
                    return {
                        ...clip,
                        jointTracks: clip.jointTracks.map(track => track.targetId === targetId
                            ? {...track, records: track.records.map(r => r.time === oldTime ? {...r, time: t} : r)}
                            : track),
                    }
                }
                return {
                    ...clip,
                    boneTracks: clip.boneTracks.map(track => track.targetId === targetId
                        ? {...track, records: track.records.map(r => r.time === oldTime ? {...r, time: t} : r)}
                        : track),
                }
            })
            /* 更新选中时间 */
            const next = new Map(selection)
            const set = new Set(next.get(targetId) ?? [])
            if (set.delete(oldTime)) set.add(t)
            next.set(targetId, set)
            selection = next
            history.endEdit()
            canvasModel.render()
            renderTrackList()
        },
        onSelectArea: (from, to, additive) => {
            const lo = Math.min(from, to)
            const hi = Math.max(from, to)
            const next = additive ? new Map(selection) : new Map()
            for (const track of buildTracks()) {
                const inRange = track.keyframes.filter(kf => kf.time >= lo && kf.time <= hi)
                if (inRange.length === 0) continue
                const set = new Set(next.get(track.targetId) ?? [])
                for (const kf of inRange) set.add(kf.time)
                next.set(track.targetId, set)
            }
            selection = next
            updateCurveEditor()
            canvasModel.render()
        },
        onZoom: (factor) => {
            pxPerSec = Math.max(TIMELINE_MIN_PX_PER_SEC, Math.min(TIMELINE_MAX_PX_PER_SEC, pxPerSec * factor))
            canvasModel.render()
        },
        onAddKeyframeAt: (t) => {
            addKeyframeAt(t)
        },
    })

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
        renderTrackList()
        canvasModel.render()
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
        renderTrackList()
        canvasModel.render()
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
        renderTrackList()
        canvasModel.render()
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
        renderTrackList()
        canvasModel.render()
    }

    /* ── 曲线编辑器（选中关键帧 → 显示该目标当前段的缓动曲线） ── */
    const curveCtx = curveCanvas.getContext('2d')

    const updateCurveEditor = (): void => {
        const clip = store.current
        if (clip === undefined || selection.size !== 1) {
            curveWrap.style.display = 'none'
            return
        }
        const [targetId, times] = [...selection.entries()][0]
        const time = [...times][0]
        const jointTrack = clip.jointTracks.find(t => t.targetId === targetId)
        const boneTrack = clip.boneTracks.find(t => t.targetId === targetId)
        const track = jointTrack ?? boneTrack
        if (track === undefined) {
            curveWrap.style.display = 'none'
            return
        }
        const idx = track.records.findIndex(r => r.time === time)
        if (idx < 0 || idx >= track.records.length - 1) {
            curveWrap.style.display = 'none'
            return
        }
        curveWrap.style.display = 'block'
        drawCurve(track.interpolation)
    }

    const drawCurve = (spec: {type: 'linear' | 'bezier_quad'; strategy: 'none' | 'ease_in' | 'ease_out' | 'strike_peak'; customCy?: number; peakRatio?: number}): void => {
        if (curveCtx === null) return
        const w = curveCanvas.width
        const h = curveCanvas.height
        const c = curveCtx
        c.clearRect(0, 0, w, h)
        c.fillStyle = '#14141a'
        c.fillRect(0, 0, w, h)
        const pad = 12
        const drawY = h - pad
        const drawH = h - pad * 2
        const evalY = (p: number): number => {
            /* 与 applyTransition 相同语义 */
            if (spec.type === 'linear') return drawY - p * drawH
            if (spec.strategy === 'strike_peak') {
                const k = spec.peakRatio ?? 0.7
                const v = p < k ? p * p / k : k + (1 - k) * (1 - (1 - (p - k) / (1 - k)) ** 2)
                return drawY - v * drawH
            }
            const cy = spec.customCy ?? (spec.strategy === 'ease_in' ? 0 : spec.strategy === 'ease_out' ? 1 : 0.5)
            const v = p * p + 2 * p * (1 - p) * cy
            return drawY - v * drawH
        }
        /* 对角参考线 */
        c.strokeStyle = '#333'
        c.beginPath()
        c.moveTo(pad, drawY)
        c.lineTo(w - pad, pad)
        c.stroke()
        /* 曲线 */
        c.strokeStyle = '#ffcc44'
        c.lineWidth = 2
        c.beginPath()
        for (let i = 0; i <= 40; i++) {
            const p = i / 40
            const x = pad + p * (w - pad * 2)
            const y = evalY(p)
            if (i === 0) c.moveTo(x, y)
            else c.lineTo(x, y)
        }
        c.stroke()
        /* 控制点 */
        if (spec.type === 'bezier_quad') {
            const cy = spec.customCy ?? (spec.strategy === 'ease_in' ? 0 : spec.strategy === 'ease_out' ? 1 : 0.5)
            const cx = pad + 0.5 * (w - pad * 2)
            const cyy = drawY - cy * drawH
            c.fillStyle = '#88bbff'
            c.beginPath()
            c.arc(cx, cyy, 5, 0, Math.PI * 2)
            c.fill()
        }
    }

    curveCanvas.addEventListener('mousedown', (e: MouseEvent) => {
        const clip = store.current
        if (clip === undefined || selection.size !== 1) return
        const [targetId] = [...selection.entries()][0]
        const jointTrack = clip.jointTracks.find(t => t.targetId === targetId)
        const boneTrack = clip.boneTracks.find(t => t.targetId === targetId)
        const track = jointTrack ?? boneTrack
        if (track === undefined) return
        const rect = curveCanvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        /* 控制点区域（中点 ±10px） */
        const w = curveCanvas.width
        const h = curveCanvas.height
        const pad = 12
        const cx = pad + 0.5 * (w - pad * 2)
        if (Math.abs(mx - cx) > 10) return
        const cy = track.interpolation.customCy ?? (track.interpolation.strategy === 'ease_in' ? 0 : track.interpolation.strategy === 'ease_out' ? 1 : 0.5)
        const cyy = h - pad - cy * (h - pad * 2)
        if (Math.abs(my - cyy) > 10) return
        history.startEdit()
        const onMove = (ev: MouseEvent): void => {
            const rect2 = curveCanvas.getBoundingClientRect()
            const localY = ev.clientY - rect2.top
            const value = Math.max(0, Math.min(1, (h - pad - localY) / (h - pad * 2)))
            store.updateCurrent(current => {
                const patchJoint = (t: BoneJointTrack): BoneJointTrack => ({
                    ...t,
                    interpolation: {...t.interpolation, type: 'bezier_quad' as const, customCy: value},
                })
                const patchBone = (t: BoneSegmentTrack): BoneSegmentTrack => ({
                    ...t,
                    interpolation: {...t.interpolation, type: 'bezier_quad' as const, customCy: value},
                })
                return {
                    ...current,
                    jointTracks: current.jointTracks.map(t => t.targetId === targetId ? patchJoint(t) : t),
                    boneTracks: current.boneTracks.map(t => t.targetId === targetId ? patchBone(t) : t),
                }
            })
            drawCurve({type: 'bezier_quad', strategy: 'none', customCy: value})
        }
        const onUp = (): void => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            history.endEdit()
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    })

    /* ── 洋葱皮：前后帧半透明骨骼副本 ── */
    const setupOnion = (): void => {
        const skeleton = world.getFocus()?.skeleton
        if (skeleton === undefined) return
        const root = new Group()
        const joints = new Map<string, Group>()
        for (const joint of skeleton.joints.values()) {
            joints.set(joint.id, new Group())
        }
        /* 半透明关节盒 */
        for (const joint of skeleton.joints.values()) {
            const group = joints.get(joint.id)!
            const parent = joint.parent !== undefined ? joints.get(joint.parent.id) : undefined
            if (parent !== undefined) parent.add(group)
            else root.add(group)
            const box = new Mesh(
                new BoxGeometry(ONION_SKIN_JOINT_SIZE, ONION_SKIN_JOINT_SIZE, ONION_SKIN_JOINT_SIZE),
                new MeshBasicMaterial({color: 0x88ccff, transparent: true, opacity: 0.35, depthWrite: false}),
            )
            group.add(box)
        }
        world.getFocus()?.visuals.rootGroup.add(root)
        onionGroup = {root, joints}
    }

    const updateOnion = (): void => {
        const clip = store.current
        if (onionGroup === undefined || clip === undefined) return
        /* 前后帧采样：把采样 pose 应用到洋葱皮 Group 层级（层次与骨架同构，写局部即可） */
        for (const step of [0, -ONION_SKIN_STEP, ONION_SKIN_STEP]) {
            const pose = sampleClip(clip, playhead + step)
            for (const [jointId, jointPose] of pose.jointPoses) {
                const group = onionGroup.joints.get(jointId)
                if (group === undefined) continue
                group.position.copy(jointPose.position)
                group.quaternion.copy(jointPose.rotation)
            }
        }
    }

    /* ── 播放控制 ── */
    const togglePlay = (): void => {
        if (player === undefined) return
        if (player.isPlaying) player.pause()
        else player.play()
    }

    playBtn.addEventListener('click', togglePlay)
    stopBtn.addEventListener('click', () => {
        player?.stop()
        playhead = 0
        canvasModel.render()
    })
    loopInput.addEventListener('change', () => {
        history.startEdit()
        store.updateMeta({loop: loopInput.checked})
        rebuildPlayer()
        history.endEdit()
    })
    durationInput.addEventListener('change', () => {
        const v = parseFloat(durationInput.value)
        if (Number.isNaN(v) || v <= 0) return
        history.startEdit()
        store.updateMeta({duration: v})
        rebuildPlayer()
        history.endEdit()
    })
    speedInput.addEventListener('change', () => {
        const v = parseFloat(speedInput.value)
        if (!Number.isNaN(v)) {
            player?.setSpeed(v)
            playerSpeedRef.current = v
        }
    })
    animSelect.addEventListener('change', () => {
        history.startEdit()
        store.select(animSelect.value)
        rebuildPlayer()
        history.endEdit()
        renderTrackList()
        canvasModel.render()
    })
    newAnimBtn.addEventListener('click', () => {
        history.startEdit()
        store.createEmpty('动画')
        rebuildPlayer()
        history.endEdit()
        refreshControls()
        renderTrackList()
        canvasModel.render()
    })
    renameAnimBtn.addEventListener('click', () => {
        const name = store.currentName
        if (name === undefined) return
        const next = window.prompt('新动画名：', name)
        if (next === null || next.trim() === '' || next === name) return
        history.startEdit()
        store.rename(name, next.trim())
        history.endEdit()
        refreshControls()
    })
    delAnimBtn.addEventListener('click', () => {
        const name = store.currentName
        if (name === undefined) return
        history.startEdit()
        store.remove(name)
        rebuildPlayer()
        history.endEdit()
        refreshControls()
        renderTrackList()
        canvasModel.render()
    })
    addKeyBtn.addEventListener('click', () => addKeyframeAt(playhead))
    addEventBtn.addEventListener('click', () => addEventAt(playhead))
    delKeyBtn.addEventListener('click', deleteSelection)
    copyBtn.addEventListener('click', copySelection)
    pasteBtn.addEventListener('click', pasteClipboard)
    onionBtn.addEventListener('click', () => {
        onionEnabled = !onionEnabled
        onionBtn.textContent = onionEnabled ? '洋葱皮开' : '洋葱皮'
        if (onionEnabled) setupOnion()
        else {
            onionGroup?.root.removeFromParent()
            onionGroup = undefined
        }
    })
    ikBtn.addEventListener('click', () => {
        ikEnabled = !ikEnabled
        ikBtn.textContent = ikEnabled ? 'IK 开' : 'IK 关'
    })
    undoBtn.addEventListener('click', () => history.undo())
    redoBtn.addEventListener('click', () => history.redo())
    exportBtn.addEventListener('click', () => exportAsset())
    importBtn.addEventListener('click', () => importAsset())
    skeletonSelect.addEventListener('change', () => {
        const id = Number(skeletonSelect.value)
        world.focus(id)
        selection = new Map()
        updateCurveEditor()
        rebuildPlayer()
        refreshControls()
        renderTrackList()
        canvasModel.render()
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

    /* ── 导出/导入 ── */
    const exportAsset = (): void => {
        const skeleton = world.getFocus()?.skeleton
        if (skeleton === undefined) return
        const clips = [...store.clips.values()].map(clipToJSON)
        const json = JSON.stringify({
            formatVersion: 1,
            skeleton: skeletonToDefinition(skeleton),
            animations: clips,
        }, null, 2)
        const blob = new Blob([json], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bone-asset-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const importAsset = (): void => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.addEventListener('change', () => {
            const file = input.files?.[0]
            if (file === undefined) return
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    if (typeof reader.result !== 'string') return
                    const raw = JSON.parse(reader.result) as unknown
                    const asset = parseAsset(JSON.stringify(raw))
                    const entity = world.addFromDefinition(asset.skeleton, `导入骨架${world.getEntityList().length + 1}`)
                    world.focus(entity.id)
                    history.startEdit()
                    store.replaceAll(asset.animations, asset.animations[0]?.name)
                    rebuildPlayer()
                    history.endEdit()
                    refreshControls()
                    renderTrackList()
                    canvasModel.render()
                } catch {
                    window.alert('资产文件格式无效！')
                }
            }
            reader.readAsText(file)
        })
        input.click()
    }

    const applyLibrary = (clips: readonly ClipJSON[], currentName?: string): void => {
        store.replaceAll(clips.map(clipFromJSON), currentName)
        rebuildPlayer()
        refreshControls()
        renderTrackList()
        canvasModel.render()
    }

    /* ── 布局/尺寸 ── */
    let lastCanvasWidth = 0
    let lastCanvasHeight = 0
    const layout = (): void => {
        const width = canvasWrap.clientWidth
        const height = canvasWrap.clientHeight
        if (width === lastCanvasWidth && height === lastCanvasHeight) return
        lastCanvasWidth = width
        lastCanvasHeight = height
        canvasModel.setSize(width, height)
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
            updateOnion()
            canvasModel.render()
        }
        /* DOM 可测试面：播放头时间 */
        container.dataset.playheadTime = playhead.toFixed(3)
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
    renderTrackList()
    layout()

    return {
        container,
        updater,
        get playheadTime() { return playhead },
        isIkEnabled: () => ikEnabled,
        applyLibrary,
        togglePlay,
        exportAsset,
        importAsset,
        edit,
        destroy: () => {
            player?.pause()
            window.removeEventListener('resize', onResize)
            window.removeEventListener('keydown', onKeyDown)
            onionGroup?.root.removeFromParent()
            container.remove()
        },
    }
}