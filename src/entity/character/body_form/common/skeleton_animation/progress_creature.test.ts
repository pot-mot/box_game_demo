import {describe, expect, it} from 'vitest'
import {Euler} from 'three'
import type {AnimationContext} from '../../../appearance/types.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../../../../character/weapon/catalog.ts'
import {buildWolfSkeleton} from '../../wolf/skeleton/skeleton.ts'
import {wolfAttackClip, wolfBaseClip} from '../../wolf/skeleton_animation/clips.ts'
import type {JointPose} from '../creature_runtime/pose.ts'
import {sampleClip} from '../../../../../skeleton/anim/sampling.ts'
import {evaluateProgressComposition} from './progress_composition.ts'
import {resolveCreatureFrame, type CreatureProgressConfig} from './progress_creature.ts'

const CONFIG: CreatureProgressConfig = {
    skeleton: buildWolfSkeleton,
    baseClip: wolfBaseClip,
    attackClip: wolfAttackClip,
    turnAim: {body: 'body', neck: 'neck', head: 'head'},
    fallingJoints: ['flHip', 'flKnee', 'frHip', 'frKnee', 'rlHip', 'rlKnee', 'rrHip', 'rrKnee'],
}

const ctx = (overrides: Partial<AnimationContext> = {}): AnimationContext => ({
    stateTime: 0,
    horizontalSpeed: 0,
    attackSegment: undefined,
    attackPhase: undefined,
    attackPhaseProgress: 0,
    attackTotalProgress: 0,
    attackPhaseIndex: 0,
    attackCharge: 0,
    attackHolding: false,
    weaponHeld: false,
    ...overrides,
})

const rotationOf = (pose: JointPose | undefined): readonly [number, number, number] => {
    if (pose === undefined) return [0, 0, 0]
    return 'rotation' in pose ? pose.rotation : pose
}

describe('resolveCreatureFrame', () => {
    it('walking 进度随水平速度改变步态速度', () => {
        const slow = resolveCreatureFrame('walking', ctx({stateTime: 0.4, horizontalSpeed: 0}), CONFIG)
        const fast = resolveCreatureFrame('walking', ctx({stateTime: 0.4, horizontalSpeed: 3.7}), CONFIG)
        expect(fast.progress).toBeGreaterThan(slow.progress)
    })

    it('falling 垂直速度通过 additive 层收腿', () => {
        const slowFall = resolveCreatureFrame('falling', ctx({stateTime: 0.2, verticalSpeed: 0}), CONFIG)
        const fastFall = resolveCreatureFrame('falling', ctx({stateTime: 0.2, verticalSpeed: -10}), CONFIG)
        const slowPose = evaluateProgressComposition(slowFall.graph, slowFall.progress, {
            restPose: slowFall.restPose,
            params: slowFall.params,
        })
        const fastPose = evaluateProgressComposition(fastFall.graph, fastFall.progress, {
            restPose: fastFall.restPose,
            params: fastFall.params,
        })
        expect(rotationOf(fastPose.flHip)[0] - rotationOf(slowPose.flHip)[0]).toBeGreaterThan(0.1)
    })

    it('组合求值与直接采样 base clip 一致', () => {
        const frame = resolveCreatureFrame('walking', ctx({stateTime: 0.2, horizontalSpeed: 3.7}), CONFIG)
        const graphPose = evaluateProgressComposition(frame.graph, frame.progress, {
            restPose: frame.restPose,
            params: frame.params,
        })
        const clip = wolfBaseClip('walking')
        const clipPose = sampleClip(clip, frame.progress * clip.duration)
        for (const [jointId, jointPose] of clipPose.jointPoses) {
            const graph = graphPose[jointId]
            expect(graph, jointId).toBeDefined()
            const rotation = rotationOf(graph)
            const euler = new Euler().setFromQuaternion(jointPose.rotation, 'XYZ')
            expect(rotation[0], `${jointId}.x`).toBeCloseTo(euler.x, 4)
            expect(rotation[1], `${jointId}.y`).toBeCloseTo(euler.y, 4)
            expect(rotation[2], `${jointId}.z`).toBeCloseTo(euler.z, 4)
            if ('position' in graph) {
                expect(graph.position[0], `${jointId}.px`).toBeCloseTo(jointPose.position.x, 5)
                expect(graph.position[1], `${jointId}.py`).toBeCloseTo(jointPose.position.y, 5)
                expect(graph.position[2], `${jointId}.pz`).toBeCloseTo(jointPose.position.z, 5)
            }
        }
    })

    it('攻击帧携带 hitbox 事件', () => {
        const preset = findWeaponPreset('wolf_bite')
        if (preset === undefined) throw new Error('wolf_bite 未注册')
        const attacks = weaponAttacksOf(preset)
        const segment = attacks.segments[attacks.chains.light.entries[0].segmentId]
        const frame = resolveCreatureFrame('attacking', ctx({
            attackSegment: segment,
            attackTotalProgress: 0.5,
        }), CONFIG)
        expect(frame.events.map(event => event.eventName)).toEqual(['hitbox_on', 'hitbox_off'])
    })
})
