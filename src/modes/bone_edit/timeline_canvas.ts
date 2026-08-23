import {
    KEYFRAME_COLOR,
    KEYFRAME_DIAMOND_SIZE,
    KEYFRAME_EVENT_COLOR,
    KEYFRAME_SELECTED_COLOR,
    TIMELINE_BG,
    TIMELINE_GRID_LINE,
    TIMELINE_LABEL,
    TIMELINE_PLAYHEAD,
    TRACK_ROW_HEIGHT,
} from './constants.ts'

/** 轨道行（canvas 侧模型，由 timeline.ts 提供） */
export interface TimelineCanvasTrack {
    readonly targetId: string
    readonly kind: 'joint' | 'bone' | 'event'
    /** 关键帧（事件轨为事件）时间点 */
    readonly keyframes: readonly {time: number; selected: boolean}[]
}

/** canvas 交互回调模型 */
export interface TimelineCanvasModel {
    readonly pxPerSec: number
    readonly duration: number
    readonly playhead: number
    readonly tracks: readonly TimelineCanvasTrack[]
    /** 标尺上点击 → 定位播放头（scrub） */
    onScrub: (time: number) => void
    /** 点击关键帧（additive = Shift 多选） */
    onSelectKeyframe: (targetId: string, time: number, additive: boolean) => void
    /** 拖拽关键帧改时间（clamp 到 [0, duration]） */
    onDragKeyframe: (targetId: string, oldTime: number, newTime: number) => void
    /** 框选区间（additive = Shift） */
    onSelectArea: (from: number, to: number, additive: boolean) => void
    /** Ctrl+滚轮缩放（factor > 1 放大） */
    onZoom: (factor: number) => void
    /** 双击空白：在 time 处添加关键帧（对象 = 当前选中目标或全部） */
    onAddKeyframeAt: (time: number) => void
}

const HEADER_HEIGHT = 24
const TRACK_LEFT_PAD = 8

/** 时间轴 canvas：标尺/轨道行/关键帧菱形/播放头渲染 + 鼠标交互 */
export const setupTimelineCanvas = (
    canvas: HTMLCanvasElement,
    model: TimelineCanvasModel,
): {render: () => void; setSize: (width: number, height: number) => void; destroy: () => void} => {
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
        throw new Error('setupTimelineCanvas 失败：无法获取 2d 上下文')
    }

    /* ── 交互状态 ── */
    let dragMode: 'keyframe' | 'scrub' | 'area' | 'none' = 'none'
    let dragTarget: {targetId: string; time: number} | undefined
    let dragStartPointer = {x: 0, y: 0}
    let areaFrom = 0

    const timeToX = (time: number): number => TRACK_LEFT_PAD + time * model.pxPerSec
    const xToTime = (x: number): number => Math.max(0, Math.min(model.duration, (x - TRACK_LEFT_PAD) / model.pxPerSec))
    const rowY = (index: number): number => HEADER_HEIGHT + index * TRACK_ROW_HEIGHT
    const keyframeHit = (mx: number, my: number): {targetId: string; time: number; kind: 'joint' | 'bone' | 'event'} | undefined => {
        const r = KEYFRAME_DIAMOND_SIZE / 2 + 2
        for (let i = 0; i < model.tracks.length; i++) {
            const track = model.tracks[i]
            const y = rowY(i) + TRACK_ROW_HEIGHT / 2
            if (Math.abs(my - y) > r) continue
            for (const kf of track.keyframes) {
                const x = timeToX(kf.time)
                if (Math.abs(mx - x) <= r) {
                    return {targetId: track.targetId, time: kf.time, kind: track.kind}
                }
            }
        }
        return undefined
    }

    const toNdcX = (clientX: number): number => {
        const rect = canvas.getBoundingClientRect()
        return clientX - rect.left
    }
    const toNdcY = (clientY: number): number => {
        const rect = canvas.getBoundingClientRect()
        return clientY - rect.top
    }

    const onMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return
        const mx = toNdcX(e.clientX)
        const my = toNdcY(e.clientY)
        canvas.focus()
        const hit = keyframeHit(mx, my)
        if (hit !== undefined) {
            if (e.shiftKey) {
                model.onSelectKeyframe(hit.targetId, hit.time, true)
                dragMode = 'none'
                return
            }
            model.onSelectKeyframe(hit.targetId, hit.time, false)
            dragMode = 'keyframe'
            dragTarget = {targetId: hit.targetId, time: hit.time}
            dragStartPointer = {x: mx, y: my}
            return
        }
        if (my < HEADER_HEIGHT) {
            dragMode = 'scrub'
            model.onScrub(xToTime(mx))
            return
        }
        dragMode = 'area'
        areaFrom = xToTime(mx)
        dragStartPointer = {x: mx, y: my}
        if (!e.shiftKey) {
            /* 空白单击（未拖拽）清除选择 */
            model.onSelectArea(areaFrom, areaFrom, false)
        }
    }

    const onMouseMove = (e: MouseEvent): void => {
        const mx = toNdcX(e.clientX)
        const my = toNdcY(e.clientY)
        if (dragMode === 'keyframe' && dragTarget !== undefined) {
            const newTime = xToTime(mx)
            if (newTime !== dragTarget.time) {
                model.onDragKeyframe(dragTarget.targetId, dragTarget.time, newTime)
                dragTarget.time = newTime
            }
            return
        }
        if (dragMode === 'scrub') {
            model.onScrub(xToTime(mx))
            return
        }
        if (dragMode === 'area') {
            /* 拖拽超过阈值才视为框选，否则视为点击清除 */
            if (Math.abs(mx - dragStartPointer.x) < 4 && Math.abs(my - dragStartPointer.y) < 4) return
            model.onSelectArea(areaFrom, xToTime(mx), e.shiftKey)
        }
    }

    const onMouseUp = (): void => {
        dragMode = 'none'
        dragTarget = undefined
    }

    const onWheel = (e: WheelEvent): void => {
        if (!e.ctrlKey) return
        e.preventDefault()
        model.onZoom(e.deltaY < 0 ? 1.1 : 0.9)
    }

    const onDblClick = (e: MouseEvent): void => {
        const mx = toNdcX(e.clientX)
        const my = toNdcY(e.clientY)
        if (my < HEADER_HEIGHT) return
        if (keyframeHit(mx, my) !== undefined) return
        model.onAddKeyframeAt(xToTime(mx))
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, {passive: false})
    canvas.addEventListener('dblclick', onDblClick)

    /* ── 渲染 ── */
    const render = (): void => {
        const width = canvas.width
        const height = canvas.height
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = TIMELINE_BG
        ctx.fillRect(0, 0, width, height)

        /* 刻度网格线 */
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        for (let t = 0; t <= model.duration; t += 0.25) {
            const x = timeToX(t)
            const isMajor = Math.abs(t % 1) < 0.01
            ctx.strokeStyle = isMajor ? TIMELINE_GRID_LINE : 'rgba(42,42,51,0.5)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x, HEADER_HEIGHT)
            ctx.lineTo(x, height)
            ctx.stroke()
            if (isMajor) {
                ctx.fillStyle = TIMELINE_LABEL
                ctx.fillText(`${t.toFixed(0)}s`, x, 15)
            }
        }

        /* 轨道分隔线 + 关键帧菱形 */
        model.tracks.forEach((track, i) => {
            const y = rowY(i)
            ctx.strokeStyle = TIMELINE_GRID_LINE
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
            const isEvent = track.kind === 'event'
            for (const kf of track.keyframes) {
                const x = timeToX(kf.time)
                const cy = y + TRACK_ROW_HEIGHT / 2
                const r = KEYFRAME_DIAMOND_SIZE / 2
                ctx.fillStyle = kf.selected ? KEYFRAME_SELECTED_COLOR : (isEvent ? KEYFRAME_EVENT_COLOR : KEYFRAME_COLOR)
                ctx.beginPath()
                ctx.moveTo(x, cy - r)
                ctx.lineTo(x + r, cy)
                ctx.lineTo(x, cy + r)
                ctx.lineTo(x - r, cy)
                ctx.closePath()
                ctx.fill()
            }
        })

        /* 播放头 */
        const px = timeToX(model.playhead)
        ctx.strokeStyle = TIMELINE_PLAYHEAD
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(px, 0)
        ctx.lineTo(px, height)
        ctx.stroke()
        ctx.fillStyle = TIMELINE_PLAYHEAD
        ctx.beginPath()
        ctx.moveTo(px, 0)
        ctx.lineTo(px - 5, 8)
        ctx.lineTo(px + 5, 8)
        ctx.closePath()
        ctx.fill()
    }

    const setSize = (width: number, height: number): void => {
        canvas.width = Math.max(width, 1)
        canvas.height = Math.max(height, 1)
        render()
    }

    const destroy = (): void => {
        canvas.removeEventListener('mousedown', onMouseDown)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('dblclick', onDblClick)
    }

    return {render, setSize, destroy}
}