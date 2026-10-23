import {describe, it, expect, beforeEach} from 'vitest'
import {bakeScriptedMotions} from './common/authoring/bake.ts'
import {assertFinitePose, mergePoses} from './common/authoring/pose_compose.ts'
import {isPoseWithPosition, type JointPose} from './common/creature_runtime/pose.ts'
import type {ScriptedMotion} from './common/authoring/motion.ts'
import {headTurn, hipSwing, kneeBend, legLift, spineBend} from './humanoid/skeleton_animation/rig.ts'
import {wolfBodyLean, wolfKneeBend, wolfLegLift, wolfTailLift} from './wolf/skeleton_animation/rig.ts'
import {horseHeadNod, horseHipSwing, horseKneeBend, horseLegLift} from './horse/skeleton_animation/rig.ts'
import {wyvernHipSwing, wyvernKneeBend, wyvernLegLift, wyvernWingBase, wyvernWings} from './wyvern/skeleton_animation/rig.ts'
import {buildCharacterSkeletonDefinition} from './humanoid/skeleton/skeleton.ts'
import {BONE_EDIT_FORM_PROFILES} from '../../../modes/bone_edit/form_catalog.ts'
import {ensureScriptCache, invalidateScriptCache} from '../../../modes/bone_edit/script_cache.ts'

const motionOf = (overrides: Partial<ScriptedMotion> = {}): ScriptedMotion => ({
    id: 'nod',
    nameKey: 'bone_edit.script.humanoid.wave',
    duration: 0.5,
    loop: false,
    pose: () => headTurn(0.1),
    ...overrides,
})

beforeEach(() => {
    for (const profile of BONE_EDIT_FORM_PROFILES) invalidateScriptCache(profile.formId)
})

describe('语义姿态合成', () => {
    it('同关节旋转相加、位置后写覆盖，未声明关节不出现', () => {
        const merged = mergePoses(
            {headNeck: [0.1, 0.2, 0.3], rightArmShoulder: {rotation: [0, 0, 0], position: [1, 2, 3]}},
            {headNeck: [0.4, 0.5, 0.6]},
            {rightArmShoulder: [0, 0, 0]},
        )
        expect(merged.headNeck).toEqual([expect.closeTo(0.5), expect.closeTo(0.7), expect.closeTo(0.9)])
        expect(merged.rightArmShoulder).toEqual({rotation: [0, 0, 0], position: [1, 2, 3]})
        expect(merged.leftArmShoulder).toBeUndefined()
    })

    it('拒绝非有限姿态分量', () => {
        expect(() => assertFinitePose([Number.NaN, 0, 0], 'headNeck')).toThrow()
        expect(() => assertFinitePose({rotation: [0, 0, 0], position: [0, Infinity, 0]}, 'headNeck')).toThrow()
    })
})

describe('语义关节函数', () => {
    it('每个函数只驱动 1–2 个目标关节，合成后关节集合可预测', () => {
        const humanoid = mergePoses(
            spineBend(0.2),
            hipSwing('left', -0.3),
            kneeBend('left', 0.6),
            legLift('right', 0.4),
        )
        expect(Object.keys(humanoid).sort()).toEqual([
            'leftLegHip', 'leftLegKnee', 'rightLegHip', 'rightLegKnee', 'spine',
        ])

        const wolf = mergePoses(wolfBodyLean(0.1), wolfKneeBend('fl', 0.5), wolfLegLift('fr', 0.3), wolfTailLift(0.2))
        expect(Object.keys(wolf).sort()).toEqual(['body', 'flKnee', 'frHip', 'frKnee', 'tailA', 'tailB'])

        const horse = mergePoses(horseHeadNod(0.2), horseHipSwing('rl', -0.3), horseKneeBend('rl', 0.4), horseLegLift('fl', 0.25))
        expect(Object.keys(horse).sort()).toEqual(['flHip', 'flKnee', 'head', 'neck', 'rlHip', 'rlKnee'])

        const wyvern = mergePoses(wyvernWingBase('l', 0.8), wyvernHipSwing('r', -0.4), wyvernKneeBend('r', 0.5), wyvernLegLift('l', 0.2))
        expect(Object.keys(wyvern).sort()).toEqual(['lHip', 'lKnee', 'rHip', 'rKnee', 'wingLBase'])
        /* 双翼展开必须同时驱动腕爪，否则脚本 clip 会漏掉翼爪骨骼 */
        expect(Object.keys(wyvernWings(1)).sort()).toEqual([
            'wingLBase', 'wingLClaw', 'wingLElbow', 'wingLFingerA', 'wingLFingerB', 'wingLFingerC', 'wingLFingerD', 'wingLWrist',
            'wingRBase', 'wingRClaw', 'wingRElbow', 'wingRFingerA', 'wingRFingerB', 'wingRFingerC', 'wingRFingerD', 'wingRWrist',
        ])
        for (const pose of [humanoid, wolf, horse, wyvern]) {
            for (const value of Object.values(pose) as JointPose[]) {
                expect(Number.isFinite(isPoseWithPosition(value) ? value.rotation[0] : value[0])).toBe(true)
            }
        }
    })
})

describe('脚本动作 JIT 烘焙', () => {
    it('生成稳定 clip 名，并隔离单个动作错误', () => {
        const skeleton = buildCharacterSkeletonDefinition()
        const result = bakeScriptedMotions('humanoid', skeleton, [
            motionOf(),
            motionOf({id: 'bad_joint', pose: () => ({missing: [0, 0, 0]})}),
        ])
        expect(result.clips.size).toBe(1)
        expect(result.clips.get('nod')?.name).toBe('script:humanoid:nod')
        expect(result.clips.get('nod')?.duration).toBe(0.5)
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]?.motionId).toBe('bad_joint')
    })

    it('拒绝重复 id 与非法时长', () => {
        const skeleton = buildCharacterSkeletonDefinition()
        const result = bakeScriptedMotions('humanoid', skeleton, [
            motionOf(),
            motionOf(),
            motionOf({id: 'zero', duration: 0}),
        ])
        expect(result.clips.size).toBe(1)
        expect(result.errors.map(error => error.motionId)).toEqual(['nod', 'zero'])
    })
})

describe('体形脚本配置', () => {
    it('四种体形都有可用预设，且内置动作全部烘焙成功', () => {
        expect(BONE_EDIT_FORM_PROFILES.map(profile => profile.formId)).toEqual(['humanoid', 'wolf', 'horse', 'wyvern'])
        for (const profile of BONE_EDIT_FORM_PROFILES) {
            const skeleton = profile.preset.createDefinition()
            const result = bakeScriptedMotions(profile.formId, skeleton, profile.motions)
            expect(result.clips.size, profile.formId).toBe(profile.motions.length)
            expect(result.errors, profile.formId).toEqual([])
            expect(profile.motions.every(motion => result.clips.get(motion.id)?.name === `script:${profile.formId}:${motion.id}`)).toBe(true)
        }
    })

    it('同一骨架复用缓存，重新烘焙后失效', () => {
        const profile = BONE_EDIT_FORM_PROFILES[0]
        if (profile === undefined) throw new Error('缺少 humanoid 配置')
        const skeleton = profile.preset.createDefinition()
        const first = ensureScriptCache(profile.formId, skeleton, profile.motions)
        const second = ensureScriptCache(profile.formId, skeleton, profile.motions)
        expect(second).toBe(first)
        invalidateScriptCache(profile.formId)
        const third = ensureScriptCache(profile.formId, skeleton, profile.motions)
        expect(third).not.toBe(first)
    })
})
