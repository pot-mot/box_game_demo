import type {Skeleton} from '../skeleton.ts'
import type {BoneAnimationClip, BoneEventRecord} from './types.ts'
import {applyComposedPose, type PoseLayer} from './composition.ts'
import {sampleEvents} from './sampling.ts'

/**
 * 组合动画播放器（Q3）：把多个 pose 层按影响程度与时间进度合成后写入骨架。
 *
 * - 主时间轴时长 = 各层 clip 时长最大值；所有层都循环时主时间轴循环，否则非循环播完自停；
 * - 每层时间进度 = 主进度 × `progressScale` + `progressOffset`（用于错相位，如双持副手半程错开）；
 * - 事件按层各自的时间轴增量触发（区间左开右闭，循环跨边界分两段），供 hitbox 启停使用。
 */
export interface ComposedPlayerLayer {
    readonly clip: BoneAnimationClip
    readonly weight: number
    /** 时间进度偏移（0-1，默认 0） */
    readonly progressOffset?: number
    /** 时间进度缩放（默认 1） */
    readonly progressScale?: number
}

export interface ComposedAnimationPlayer {
    readonly layers: readonly ComposedPlayerLayer[]
    readonly duration: number
    readonly loop: boolean
    readonly updater: (dt: number) => void
    play: () => void
    pause: () => void
    stop: () => void
    /** 按主进度（0-1）定位 */
    seekProgress: (progress: number) => void
    setSpeed: (speed: number) => void
    readonly isPlaying: boolean
    readonly progress: number
    onEvent: ((record: BoneEventRecord) => void) | undefined
    onFinished: ((player: ComposedAnimationPlayer) => void) | undefined
}

export const createComposedAnimationPlayer = (
    skeleton: Skeleton,
    layers: readonly ComposedPlayerLayer[],
): ComposedAnimationPlayer => {
    const duration = layers.reduce((max, layer) => Math.max(max, layer.clip.duration), 0)
    const loop = layers.length > 0 && layers.every(layer => layer.clip.loop)
    let time = 0
    let speed = 1
    let playing = false
    let finishedNotified = false
    /** 各层上一帧的绝对采样时间（事件增量触发用） */
    const prevTimes = layers.map(() => 0)

    const layerProgress = (layer: ComposedPlayerLayer, progress: number): number =>
        progress * (layer.progressScale ?? 1) + (layer.progressOffset ?? 0)

    const buildPoseLayers = (progress: number): readonly PoseLayer[] =>
        layers.map(layer => ({clip: layer.clip, weight: layer.weight, progress: layerProgress(layer, progress)}))

    const applyAt = (progress: number): void => {
        applyComposedPose(skeleton, buildPoseLayers(progress))
    }

    /** 各层绝对时间（循环 clip 取模，非循环夹取） */
    const absoluteTimeOf = (layer: ComposedPlayerLayer, progress: number): number => {
        const t = layerProgress(layer, progress) * layer.clip.duration
        if (layer.clip.loop && layer.clip.duration > 0) {
            return ((t % layer.clip.duration) + layer.clip.duration) % layer.clip.duration
        }
        return Math.min(Math.max(t, 0), layer.clip.duration)
    }

    const fireLayerEvents = (index: number, from: number, to: number): void => {
        if (player.onEvent === undefined) return
        const clip = layers[index].clip
        const push = (): void => {
            for (const record of sampleEvents(clip, from, to)) player.onEvent?.(record)
        }
        if (to >= from) {
            push()
            return
        }
        /* 循环跨边界：分两段触发 */
        for (const record of sampleEvents(clip, from, clip.duration)) player.onEvent(record)
        for (const record of sampleEvents(clip, 0, to)) player.onEvent(record)
    }

    const fireEventsTo = (progress: number): void => {
        for (let i = 0; i < layers.length; i++) {
            const next = absoluteTimeOf(layers[i], progress)
            fireLayerEvents(i, prevTimes[i], next)
            prevTimes[i] = next
        }
    }

    const fireExactStart = (): void => {
        if (player.onEvent === undefined) return
        for (const layer of layers) {
            for (const track of layer.clip.eventTracks) {
                for (const record of track.records) {
                    if (record.time === 0) player.onEvent(record)
                }
            }
        }
    }

    const progressOf = (t: number): number => {
        if (duration <= 0) return 0
        if (loop) return ((t % duration) + duration) % duration / duration
        return Math.min(t / duration, 1)
    }

    const updater = (dt: number): void => {
        if (!playing) return
        const nextTime = time + dt * speed
        if (!loop && nextTime >= duration) {
            fireEventsTo(1)
            time = duration
            applyAt(1)
            playing = false
            if (!finishedNotified && player.onFinished !== undefined) {
                finishedNotified = true
                player.onFinished(player)
            }
            return
        }
        time = loop && duration > 0 ? ((nextTime % duration) + duration) % duration : nextTime
        const progress = progressOf(time)
        fireEventsTo(progress)
        applyAt(progress)
    }

    const play = (): void => {
        if (!loop && time >= duration) {
            time = 0
            finishedNotified = false
            for (let i = 0; i < prevTimes.length; i++) prevTimes[i] = 0
        }
        playing = true
        if (time === 0) fireExactStart()
    }

    const pause = (): void => { playing = false }

    const stop = (): void => {
        playing = false
        time = 0
        finishedNotified = false
        for (let i = 0; i < prevTimes.length; i++) prevTimes[i] = 0
        applyAt(0)
    }

    const seekProgress = (progress: number): void => {
        const clamped = Math.min(Math.max(progress, 0), 1)
        time = clamped * duration
        finishedNotified = false
        for (let i = 0; i < layers.length; i++) prevTimes[i] = absoluteTimeOf(layers[i], clamped)
        applyAt(clamped)
    }

    const player: ComposedAnimationPlayer = {
        layers,
        duration,
        loop,
        updater,
        play,
        pause,
        stop,
        seekProgress,
        setSpeed: (s: number) => { speed = Math.max(s, 0) },
        get isPlaying() { return playing },
        get progress() { return progressOf(time) },
        onEvent: undefined,
        onFinished: undefined,
    }

    applyAt(0)
    return player
}
