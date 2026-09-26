import type {BoneJointTrack, BoneSegmentTrack} from '../../skeleton/anim/types.ts'
import type {TransitionSpec} from '../../skeleton/transition.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {AnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import {setupTimelineCanvas, type TimelineCanvasTrack} from './timeline_canvas.ts'
import type {KeyframeSelection, TimelineRuntime} from './timeline_ops.ts'
import {TIMELINE_MAX_PX_PER_SEC, TIMELINE_MIN_PX_PER_SEC, TRACK_LIST_WIDTH, TRACK_ROW_HEIGHT} from './constants.ts'

/** 轨道视图依赖（DOM 容器 + 时间轴状态读写 + 运行期回调槽） */
export interface TrackViewHost {
    readonly store: AnimationStore
    readonly world: SkeletonEntitiesContext
    readonly history: BoneEditHistory
    readonly runtime: TimelineRuntime
    readonly getSelection: () => KeyframeSelection
    readonly setSelection: (selection: KeyframeSelection) => void
    readonly getPlayhead: () => number
    readonly getPxPerSec: () => number
    readonly setPxPerSec: (value: number) => void
    /** 拖动播放头：写入播放头时间并 seek 播放器 */
    readonly onScrub: (time: number) => void
    /** 选中关键帧变化（刷新曲线编辑器） */
    readonly onCurveUpdate: () => void
}

/** 轨道视图：左侧轨道列表 + canvas 时间轴（关键帧选择/拖移/框选/缩放） */
export interface TrackView {
    /** 轨道区容器（含左侧列表 + canvas） */
    readonly element: HTMLElement
    readonly renderList: () => void
    readonly renderCanvas: () => void
    /** 按容器尺寸同步 canvas（renderer 尺寸联动） */
    readonly resize: () => void
}

export const setupTrackView = (host: TrackViewHost): TrackView => {
    const {store, world, history, runtime} = host

    /* ── 轨道区（左侧列表 + canvas） ── */
    const trackArea = document.createElement('div')
    trackArea.style.cssText = 'display:flex;flex:1;min-height:0'

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

    /* 轨道行数据（canvas 模型） */
    const buildTracks = (): readonly TimelineCanvasTrack[] => {
        const clip = store.current
        const skeleton = world.getFocus()?.skeleton
        const selection = host.getSelection()
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
                interp.value = spec === undefined
                    ? 'bezier_none'
                    : spec.type === 'linear' ? 'linear_none' : `bezier_${spec.strategy}`
                interp.addEventListener('change', () => {
                    const parts = interp.value.split('_') as [string, string]
                    const type = parts[0] === 'linear' ? 'linear' : 'bezier_quad'
                    const strategy = parts[1] as 'none' | 'ease_in' | 'ease_out' | 'strike_peak'
                    const nextSpec: TransitionSpec = type === 'linear' ? {type: 'linear'} : {type: 'bezier_quad', strategy}
                    history.startEdit()
                    store.updateCurrent(current => {
                        const patchJoint = (t: BoneJointTrack): BoneJointTrack => ({...t, interpolation: nextSpec})
                        const patchBone = (t: BoneSegmentTrack): BoneSegmentTrack => ({...t, interpolation: nextSpec})
                        return {
                            ...current,
                            jointTracks: track.kind === 'joint' ? current.jointTracks.map(t => t.targetId === track.targetId ? patchJoint(t) : t) : current.jointTracks,
                            boneTracks: track.kind === 'bone' ? current.boneTracks.map(t => t.targetId === track.targetId ? patchBone(t) : t) : current.boneTracks,
                        }
                    })
                    runtime.rebuildPlayer()
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
        get pxPerSec() { return host.getPxPerSec() },
        get duration() { return store.current?.duration ?? 0 },
        get playhead() { return host.getPlayhead() },
        get tracks() { return buildTracks() },
        onScrub: (t) => {
            host.onScrub(t)
            canvasModel.render()
        },
        onSelectKeyframe: (targetId, time, additive) => {
            const next = new Map(host.getSelection())
            const set = new Set(next.get(targetId) ?? [])
            if (additive) {
                if (set.has(time)) set.delete(time)
                else set.add(time)
            } else {
                next.clear()
                set.add(time)
            }
            next.set(targetId, set)
            host.setSelection(next)
            host.onCurveUpdate()
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
            const next = new Map(host.getSelection())
            const set = new Set(next.get(targetId) ?? [])
            if (set.delete(oldTime)) set.add(t)
            next.set(targetId, set)
            host.setSelection(next)
            history.endEdit()
            canvasModel.render()
            renderTrackList()
        },
        onSelectArea: (from, to, additive) => {
            const lo = Math.min(from, to)
            const hi = Math.max(from, to)
            const next = additive ? new Map(host.getSelection()) : new Map<string, Set<number>>()
            for (const track of buildTracks()) {
                const inRange = track.keyframes.filter(kf => kf.time >= lo && kf.time <= hi)
                if (inRange.length === 0) continue
                const set = new Set(next.get(track.targetId) ?? [])
                for (const kf of inRange) set.add(kf.time)
                next.set(track.targetId, set)
            }
            host.setSelection(next)
            host.onCurveUpdate()
            canvasModel.render()
        },
        onZoom: (factor) => {
            host.setPxPerSec(Math.max(TIMELINE_MIN_PX_PER_SEC, Math.min(TIMELINE_MAX_PX_PER_SEC, host.getPxPerSec() * factor)))
            canvasModel.render()
        },
        onAddKeyframeAt: (t) => {
            runtime.addKeyframeAt(t)
        },
    })

    let lastWidth = 0
    let lastHeight = 0
    const resize = (): void => {
        const width = canvasWrap.clientWidth
        const height = canvasWrap.clientHeight
        if (width === lastWidth && height === lastHeight) return
        lastWidth = width
        lastHeight = height
        canvasModel.setSize(width, height)
    }

    return {
        element: trackArea,
        renderList: renderTrackList,
        renderCanvas: () => canvasModel.render(),
        resize,
    }
}
