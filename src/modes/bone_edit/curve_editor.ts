import type {BoneJointTrack, BoneSegmentTrack} from '../../skeleton/anim/types.ts'
import type {TransitionSpec} from '../../skeleton/transition.ts'
import type {AnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import type {KeyframeSelection} from './timeline_ops.ts'

/** 曲线编辑器依赖（DOM + 动画库 + 选中 + 历史） */
export interface CurveEditorContext {
    readonly wrap: HTMLElement
    readonly canvas: HTMLCanvasElement
    readonly store: AnimationStore
    readonly getSelection: () => KeyframeSelection
    readonly history: BoneEditHistory
}

export interface CurveEditor {
    /** 选中关键帧变化时刷新曲线视图 */
    readonly update: () => void
    readonly dispose: () => void
}

/** 关键帧缓动曲线编辑器：绘制二阶贝塞尔曲线并支持拖拽控制点（写回 track.interpolation.customCy） */
export const setupCurveEditor = (ctx: CurveEditorContext): CurveEditor => {
    const c2d = ctx.canvas.getContext('2d')

    const draw = (spec: TransitionSpec): void => {
        if (c2d === null) return
        const w = ctx.canvas.width
        const h = ctx.canvas.height
        const c = c2d
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

    const update = (): void => {
        const clip = ctx.store.current
        const selection = ctx.getSelection()
        if (clip === undefined || selection.size !== 1) {
            ctx.wrap.style.display = 'none'
            return
        }
        const [targetId, times] = [...selection.entries()][0]
        const time = [...times][0]
        const jointTrack = clip.jointTracks.find(t => t.targetId === targetId)
        const boneTrack = clip.boneTracks.find(t => t.targetId === targetId)
        const track = jointTrack ?? boneTrack
        if (track === undefined) {
            ctx.wrap.style.display = 'none'
            return
        }
        const idx = track.records.findIndex(r => r.time === time)
        if (idx < 0 || idx >= track.records.length - 1) {
            ctx.wrap.style.display = 'none'
            return
        }
        ctx.wrap.style.display = 'block'
        draw(track.interpolation)
    }

    const onMouseDown = (e: MouseEvent): void => {
        const clip = ctx.store.current
        const selection = ctx.getSelection()
        if (clip === undefined || selection.size !== 1) return
        const [targetId] = [...selection.entries()][0]
        const jointTrack = clip.jointTracks.find(t => t.targetId === targetId)
        const boneTrack = clip.boneTracks.find(t => t.targetId === targetId)
        const track = jointTrack ?? boneTrack
        if (track === undefined) return
        const rect = ctx.canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        /* 控制点区域（中点 ±10px） */
        const w = ctx.canvas.width
        const h = ctx.canvas.height
        const pad = 12
        const cx = pad + 0.5 * (w - pad * 2)
        if (Math.abs(mx - cx) > 10) return
        const interp = track.interpolation
        const cy = interp.type !== 'bezier_quad'
            ? 0.5
            : interp.customCy ?? (interp.strategy === 'ease_in' ? 0 : interp.strategy === 'ease_out' ? 1 : 0.5)
        const cyy = h - pad - cy * (h - pad * 2)
        if (Math.abs(my - cyy) > 10) return
        ctx.history.startEdit()
        const onMove = (ev: MouseEvent): void => {
            const rect2 = ctx.canvas.getBoundingClientRect()
            const localY = ev.clientY - rect2.top
            const value = Math.max(0, Math.min(1, (h - pad - localY) / (h - pad * 2)))
            ctx.store.updateCurrent(current => {
                const toBezier = (t: BoneJointTrack | BoneSegmentTrack): TransitionSpec => ({
                    type: 'bezier_quad',
                    strategy: t.interpolation.type === 'bezier_quad' ? t.interpolation.strategy : 'none',
                    customCy: value,
                })
                const patchJoint = (t: BoneJointTrack): BoneJointTrack => ({...t, interpolation: toBezier(t)})
                const patchBone = (t: BoneSegmentTrack): BoneSegmentTrack => ({...t, interpolation: toBezier(t)})
                return {
                    ...current,
                    jointTracks: current.jointTracks.map(t => t.targetId === targetId ? patchJoint(t) : t),
                    boneTracks: current.boneTracks.map(t => t.targetId === targetId ? patchBone(t) : t),
                }
            })
            draw({type: 'bezier_quad', strategy: 'none', customCy: value})
        }
        const onUp = (): void => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            ctx.history.endEdit()
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    ctx.canvas.addEventListener('mousedown', onMouseDown)
    return {
        update,
        dispose: () => ctx.canvas.removeEventListener('mousedown', onMouseDown),
    }
}
