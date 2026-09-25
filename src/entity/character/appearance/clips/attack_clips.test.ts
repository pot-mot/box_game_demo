import {describe, it, expect} from 'vitest'
import {Euler} from 'three'
import {buildAttackClip, attackClipDurationOf, getAttackClip, type AttackClipParams} from './attack_clips.ts'
import {sampleClip} from '../../../../skeleton/anim/sampling.ts'
import {createWeaponRuntime} from '../../../../character/weapon/weapon_runtime.ts'
import {orderedSegments} from '../../../../character/weapon/attack_chain.ts'
import {FALLBACK_ATTACK_DURATION} from '../constants.ts'
import {strikeCurve} from '../../../../character/combat/attack_phases.ts'

/** 短剑链主干首段 = 轻击一段（tilt=0）：武器模组的段定义即生产攻击 clip 的生成参数来源 */
const light1 = orderedSegments(createWeaponRuntime('short_sword').attacks)[0]

const params: AttackClipParams = {
    segmentId: light1.id,
    duration: light1.duration,
    recovery: light1.recovery,
    phases: light1.phases,
    tilt: light1.swingTilt ?? 0,
    gripTilt: -0.1,
}

describe('攻击 clip 生成器', () => {
    it('时长 = 动作 + 恢复；事件轨 = 0.1/0.85 动作进度（与旧 executor 窗口一致）', () => {
        const clip = buildAttackClip(params)
        expect(clip.duration).toBeCloseTo(light1.duration + light1.recovery)
        expect(attackClipDurationOf(params)).toBeCloseTo(light1.duration + light1.recovery)
        expect(clip.eventTracks[0].records.map(r => [r.eventName, r.time])).toEqual([
            ['hitbox_on', light1.duration * 0.1],
            ['hitbox_off', Math.min(light1.duration * 0.85, clip.duration)],
        ])
    })

    it('打击段中部：肩摆 = -armSwingForwardX × strikeCurve 进度（末端加速曲线生效）', () => {
        const clip = buildAttackClip(params)
        const strike = params.phases![0]
        const t = light1.duration * 0.5
        const sampled = sampleClip(clip, t)
        const expectedShoulderX = -strike.animConfig.armSwingForwardX * strikeCurve(0.5, strike.animConfig.strikePeakRatio)
        const euler = new Euler().setFromQuaternion(sampled.jointPoses.get('rightArmShoulder')!.rotation)
        expect(euler.x).toBeCloseTo(expectedShoulderX)
    })

    it('恢复段起点叠加惯性过冲：肩摆 = 打击末姿态 × (1 + overshootRatio)', () => {
        const clip = buildAttackClip(params)
        const strike = params.phases![0]
        const sampled = sampleClip(clip, light1.duration)
        const expectedShoulderX = -strike.animConfig.armSwingForwardX * (1 + strike.animConfig.overshootRatio)
        const euler = new Euler().setFromQuaternion(sampled.jointPoses.get('rightArmShoulder')!.rotation)
        expect(euler.x).toBeCloseTo(expectedShoulderX)
    })

    it('恢复阶段末：肩/腰归零（clamp 保持末姿态）', () => {
        const clip = buildAttackClip(params)
        const sampled = sampleClip(clip, clip.duration + 0.5)
        const shoulder = new Euler().setFromQuaternion(sampled.jointPoses.get('rightArmShoulder')!.rotation)
        const spine = new Euler().setFromQuaternion(sampled.jointPoses.get('spine')!.rotation)
        expect(Math.abs(shoulder.x)).toBeLessThan(0.01)
        expect(Math.abs(spine.y)).toBeLessThan(0.01)
    })

    it('无阶段信息回退：时长 = FALLBACK_ATTACK_DURATION，不抛错', () => {
        const clip = buildAttackClip({...params, phases: undefined})
        expect(clip.duration).toBeCloseTo(FALLBACK_ATTACK_DURATION)
        expect(() => sampleClip(clip, 0.2)).not.toThrow()
    })

    it('缓存复用（同参数返回同一 clip 实例）', () => {
        const a = getAttackClip(params)
        const b = getAttackClip(params)
        expect(a).toBe(b)
    })

    it('不同 tilt（横斩）生成不同姿态：腕部刃面偏转 y = tilt', () => {
        const tilt = Math.PI * 0.48
        const clip = buildAttackClip({...params, tilt})
        const tStrike = light1.duration * 0.5
        const sampled = sampleClip(clip, tStrike)
        const wrist = new Euler().setFromQuaternion(sampled.jointPoses.get('rightWristPivot')!.rotation)
        /* 腕 Y 在 strike 段随 e 插值趋近 tilt（中段时介于 0 与 tilt 之间） */
        expect(wrist.y).toBeGreaterThan(0)
        expect(wrist.y).toBeLessThan(tilt)
    })
})