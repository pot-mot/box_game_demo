import {describe, expect, it} from 'vitest'
import {BASE_CLIP_STATES, type BaseClipState, type CharacterStateName} from '../../../../../character/state_machine/types.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {PoseFunction} from '../creature_runtime/pose.ts'
import {HORSE_BASE} from '../../horse/state/form_base.ts'
import {horseBaseClip} from '../../horse/skeleton_animation/clips.ts'
import {horsePose} from '../../horse/skeleton_animation/pose_fns.ts'
import {WOLF_BASE} from '../../wolf/state/form_base.ts'
import {wolfBaseClip} from '../../wolf/skeleton_animation/clips.ts'
import {wolfPose} from '../../wolf/skeleton_animation/pose_fns.ts'
import {WYVERN_BASE} from '../../wyvern/state/form_base.ts'
import {wyvernBaseClip} from '../../wyvern/skeleton_animation/clips.ts'
import {wyvernPose} from '../../wyvern/skeleton_animation/pose_fns.ts'

interface FormCase {
    readonly id: string
    readonly animation: typeof WOLF_BASE.animation
    readonly clip: (state: BaseClipState) => BoneAnimationClip
    readonly pose: (state: CharacterStateName) => PoseFunction
}

const FORMS: readonly FormCase[] = [
    {id: 'wolf', animation: WOLF_BASE.animation, clip: wolfBaseClip, pose: wolfPose},
    {id: 'horse', animation: HORSE_BASE.animation, clip: horseBaseClip, pose: horsePose},
    {id: 'wyvern', animation: WYVERN_BASE.animation, clip: wyvernBaseClip, pose: wyvernPose},
]

/** 兽形基础动画循环接缝回归：循环状态的烘焙 clip 首帧必须与末帧完全一致 */
describe('兽形基础动画循环接缝', () => {
    for (const form of FORMS) {
        const loopStates = BASE_CLIP_STATES.filter(state => form.animation[state].loop)
        for (const state of loopStates) {
            it(`${form.id} ${state} 首尾姿态一致`, () => {
                const clip = form.clip(state)
                expect(clip.loop, `${form.id}:${state}`).toBe(true)
                for (const track of clip.jointTracks) {
                    const first = track.records[0]
                    const last = track.records[track.records.length - 1]
                    expect(first, `${track.targetId}:first`).toBeDefined()
                    expect(last, `${track.targetId}:last`).toBeDefined()
                    if (first === undefined || last === undefined) continue
                    expect(last.rotation.angleTo(first.rotation), `${track.targetId}:rotation`).toBeLessThan(1e-6)
                    expect(last.position.distanceTo(first.position), `${track.targetId}:position`).toBeLessThan(1e-6)
                }
            })
        }
    }
})

/**
 * 无专属动作的状态使用静态待机姿态：
 * 若直接借用 idle（周期按 clip 时长归一化），短时长 clip 会把呼吸 / 摆尾加速数倍。
 */
describe('兽形无专属动作状态保持静态待机姿态', () => {
    const STATIC_STATES = ['interacting', 'blocking', 'guard_broken'] as const

    for (const form of FORMS) {
        for (const state of STATIC_STATES) {
            it(`${form.id} ${state} 不随时间摆动`, () => {
                const pose = form.pose(state)
                const total = form.animation[state].duration
                expect(pose(total * 0.37, total)).toEqual(pose(0, total))
            })
        }
    }
})
