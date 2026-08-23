import type {Skeleton} from '../skeleton.ts'
import type {BoneAnimationClip, BoneEventRecord} from './types.ts'
import {sampleClip, sampleEvents} from './sampling.ts'

/**
 * 骨骼动画播放器：
 * - updater 由 main.ts 单 RAF 统一调用（每帧 time += dt × speed → 采样 → applyPose）；
 * - 循环时内部 time 保持在 [0, duration) 内（取模）；非循环播完自动停止并回调 onFinished；
 * - 事件按帧增量触发（区间左开右闭），循环跨边界时分两段触发。
 */
export interface BoneAnimationPlayer {
    readonly clip: BoneAnimationClip
    readonly updater: (dt: number) => void
    play: () => void
    pause: () => void
    stop: () => void
    seek: (time: number) => void
    /** 整体均匀变速（playbackRate，>= 0）：对齐可变阶段时长/行走滑步用 */
    setSpeed: (speed: number) => void
    readonly isPlaying: boolean
    readonly time: number
    /** 事件回调：每帧增量触发区间内事件（事件轨道消费点，如 hitbox 启停） */
    onEvent: ((record: BoneEventRecord) => void) | undefined
    /** 非循环播完时触发 */
    onFinished: ((player: BoneAnimationPlayer) => void) | undefined
}

export const createBoneAnimationPlayer = (skeleton: Skeleton, clip: BoneAnimationClip): BoneAnimationPlayer => {
    let time = 0
    let speed = 1
    let playing = false
    let finishedNotified = false

    const applyPoseAt = (t: number): void => {
        skeleton.applyPose(sampleClip(clip, t))
    }

    const fireEvents = (from: number, to: number): void => {
        if (player.onEvent === undefined) return
        if (to >= from) {
            for (const record of sampleEvents(clip, from, to)) player.onEvent(record)
            return
        }
        /* 循环跨边界：分两段触发 */
        for (const record of sampleEvents(clip, from, clip.duration)) player.onEvent(record)
        for (const record of sampleEvents(clip, 0, to)) player.onEvent(record)
    }

    /** 补发恰好落在时刻 t 上的事件（t=0 事件不会落入左开右闭的增量区间，需单独触发） */
    const fireExact = (t: number): void => {
        if (player.onEvent === undefined) return
        for (const track of clip.eventTracks) {
            for (const record of track.records) {
                if (record.time === t) player.onEvent(record)
            }
        }
    }

    const updater = (dt: number): void => {
        if (!playing) return
        const prevTime = time
        const step = dt * speed

        if (clip.loop && clip.duration > 0) {
            /* 逐段推进：步进可能跨多个周期，每段触发区间事件；
             * 跨越周期边界时补发新周期的 t=0 事件 */
            let cursor = time
            let remaining = step
            while (remaining > 0) {
                const toCycleEnd = clip.duration - cursor
                const adv = Math.min(remaining, toCycleEnd)
                const target = cursor + adv
                fireEvents(cursor, target)
                if (target < clip.duration) {
                    cursor = target
                    remaining = 0
                } else {
                    cursor = 0
                    remaining -= adv
                    fireExact(0)
                }
            }
            time = cursor
            applyPoseAt(time)
            return
        }

        const nextTime = time + step
        if (nextTime >= clip.duration) {
            fireEvents(prevTime, clip.duration)
            time = clip.duration
            applyPoseAt(time)
            playing = false
            if (!finishedNotified && player.onFinished !== undefined) {
                finishedNotified = true
                player.onFinished(player)
            }
            return
        }

        fireEvents(prevTime, nextTime)
        time = nextTime
        applyPoseAt(time)
    }

    const play = (): void => {
        /* 非循环已播完时从头开始 */
        if (!clip.loop && time >= clip.duration) {
            time = 0
            finishedNotified = false
        }
        playing = true
        /* 从头开始播放：补发 t=0 事件（左开右闭增量区间覆盖不到） */
        if (time === 0) fireExact(0)
    }

    const pause = (): void => {
        playing = false
    }

    const stop = (): void => {
        playing = false
        time = 0
        finishedNotified = false
        applyPoseAt(0)
    }

    const seek = (t: number): void => {
        time = clip.loop && clip.duration > 0
            ? ((t % clip.duration) + clip.duration) % clip.duration
            : Math.min(Math.max(t, 0), clip.duration)
        finishedNotified = false
        applyPoseAt(time)
    }

    const setSpeed = (s: number): void => {
        speed = Math.max(s, 0)
    }

    const player: BoneAnimationPlayer = {
        clip,
        updater,
        play,
        pause,
        stop,
        seek,
        setSpeed,
        get isPlaying() { return playing },
        get time() { return time },
        onEvent: undefined,
        onFinished: undefined,
    }

    applyPoseAt(0)
    return player
}