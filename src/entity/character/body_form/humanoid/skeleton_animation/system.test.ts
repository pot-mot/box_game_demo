import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import type {AnimationContext} from '../../../appearance/types.ts'
import {createAppearanceSystem} from './system.ts'
import {createHumanoidModel} from '../body_form.ts'
import {weaponAttacksOf, weaponPresetOrDefault} from '../../../../../character/weapon/catalog.ts'
import {orderedSegments} from '../../../../../character/weapon/attack_chain.ts'
import {phaseDurationOf, resolvePhases} from '../../../../../character/combat/attack_phases.ts'
import {getAttackClipById} from '../skeleton_animation/clips/attack_clips.ts'
import {SUPPORT_HAND_VISUAL_TOLERANCE} from '../../../../../test_setup.ts'

/** 行走测试水平速度（m/s）：只用于触发步频与下半身叠加，不代表角色配置默认移速 */
const WALK_SPEED = 3.7

interface CtxOverrides extends Partial<AnimationContext> {
    holdMode?: 'one_handed' | 'two_handed' | 'dual_wield'
    handedness?: 'right' | 'left'
    shieldHands?: {main: boolean; off: boolean}
    weaponClassId?: string
}

const makeCtx = (overrides: CtxOverrides = {}): AnimationContext => {
    const {holdMode = 'one_handed', handedness = 'right', shieldHands = {main: false, off: false}, weaponClassId, ...rest} = overrides
    return {
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
        ...rest,
        humanoid: {...(weaponClassId !== undefined ? {weaponClassId} : {}), holdMode, handedness, shieldHands},
    }
}

describe('外观系统基础动画播放（play() 修复回归）', () => {
    it('进入 idle 后多帧推进：头部呼吸摆动（证明 clip 播放器在播放，未修复时静止首帧）', () => {
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        /* 模型根位置由外部物理管理（模拟 syncPositions 写入） */
        model.group.position.set(3, 1, -2)
        /* 驱动若干帧（stateTime 随帧累加） */
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'idle', makeCtx({stateTime: i / 60}))
        }
        /* 头部应有呼吸摆动（sin(t·2.5)·0.02），而非静止 0 */
        expect(Math.abs(model.headNeck.rotation.x)).toBeGreaterThan(1e-4)
        /* 根位置不被动画覆盖（角色不飞回原点 / 材质跟随 body） */
        expect(model.group.position.x).toBe(3)
        expect(model.group.position.y).toBe(1)
        expect(model.group.position.z).toBe(-2)
        /* 继续推进，摆动相位变化 → 值与首帧不同 */
        const first = model.headNeck.rotation.x
        for (let i = 30; i < 90; i++) {
            sys.update(1 / 60, model, 'idle', makeCtx({stateTime: i / 60}))
        }
        expect(Math.abs(model.headNeck.rotation.x - first)).toBeGreaterThan(1e-4)
        model.dispose()
    })

    it('进入 walking 后多帧推进：腿部摆腿（步频随速度变速 setSpeed）', () => {
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'walking', makeCtx({stateTime: i / 60, horizontalSpeed: WALK_SPEED}))
        }
        /* 腿应摆动（sin(t)·0.5），非静止 0 */
        expect(Math.abs(model.rightLegHip.rotation.x)).toBeGreaterThan(1e-4)
        model.dispose()
    })

    it('行走切入稀疏攻击：未声明的腿部关节回到骨架静止姿态', () => {
        const preset = weaponPresetOrDefault('shield_small')
        const seg = orderedSegments(weaponAttacksOf(preset, 'one_handed'))
            .find(s => s.id === 'shield_small_one_handed_light_1')!
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        model.equipWeapon({main: preset.mesh})
        const sys = createAppearanceSystem()
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'walking', makeCtx({stateTime: i / 60, horizontalSpeed: WALK_SPEED}))
        }
        expect(Math.abs(model.rightLegHip.rotation.x)).toBeGreaterThan(1e-4)
        /* 盾击作者数据不含腿/头；进入攻击后应回静止，而不是保留行走腿。 */
        for (let i = 0; i < 12; i++) {
            sys.update(1 / 60, model, 'attacking', makeCtx({
                stateTime: i / 60,
                horizontalSpeed: 0,
                attackSegment: seg,
                attackPhase: 'strike',
                weaponHeld: true,
            }))
        }
        expect(Math.abs(model.rightLegHip.rotation.x)).toBeLessThan(1e-4)
        expect(Math.abs(model.leftLegHip.rotation.x)).toBeLessThan(1e-4)
        model.dispose()
    })

    it('双手共持待机 / 行走 / 跳跃：副手保持贴合武器副握点', () => {
        const preset = weaponPresetOrDefault('heavy_sword')
        for (const state of ['idle', 'walking', 'jumping'] as const) {
            const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
            model.equipWeapon({main: preset.mesh})
            const sys = createAppearanceSystem()
            for (let i = 0; i < 20; i++) {
                sys.update(1 / 60, model, state, makeCtx({
                    stateTime: i / 60,
                    weaponHeld: true,
                    holdMode: 'two_handed',
                    weaponClassId: preset.classId,
                    horizontalSpeed: state === 'walking' ? WALK_SPEED : 0,
                }))
            }
            model.group.updateMatrixWorld(true)
            const grip = model.weaponGroup!.localToWorld(new Vector3(0, model.weaponSupportGripOffset, 0))
            const supportEnd = model.leftWeaponMount.getWorldPosition(new Vector3())
            expect(supportEnd.distanceTo(grip), `${state} 支撑链末端未贴合副握点`).toBeLessThan(SUPPORT_HAND_VISUAL_TOLERANCE)
            model.dispose()
        }
    })

    it('格挡时叠加下半身行走步态（水平移动 → 双腿摆动；静止 → 静态格挡腿姿）', () => {
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        /* 静止格挡：双腿保持静态格挡姿态（rightLegHip.rx = 0.06） */
        for (let i = 0; i < 10; i++) sys.update(1 / 60, model, 'blocking', makeCtx({stateTime: i / 60, horizontalSpeed: 0}))
        const staticHip = model.rightLegHip.rotation.x
        /* 移动格挡：叠加行走步态覆盖双腿，髋角随步态相位摆动 */
        let varied = false
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'blocking', makeCtx({stateTime: i / 60, horizontalSpeed: WALK_SPEED}))
            if (Math.abs(model.rightLegHip.rotation.x - staticHip) > 1e-3) varied = true
        }
        expect(varied).toBe(true)
        model.dispose()
    })

    it('重击蓄力保持时叠加下半身行走步态（attackHolding + 移动 → 双腿摆动）', () => {
        const preset = weaponPresetOrDefault('long_sword')
        const seg = orderedSegments(weaponAttacksOf(preset, 'one_handed'))
            .find(s => s.id === 'long_sword_one_handed_heavy_1')!
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        model.equipWeapon({main: preset.mesh})
        const sys = createAppearanceSystem()
        let varied = false
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'attacking', makeCtx({
                stateTime: i / 60,
                horizontalSpeed: WALK_SPEED,
                attackSegment: seg,
                attackPhase: 'strike',
                attackHolding: true,
                weaponHeld: true,
            }))
            if (Math.abs(model.rightLegHip.rotation.x) > 1e-3) varied = true
        }
        expect(varied).toBe(true)
        model.dispose()
    })

    it('近战蓄力：满蓄力姿势 = 松开后的抬手段末（不同武器均无回位跳变，回归）', () => {
        /* 覆盖抬手姿势差异最大的几类：长枪（前刺）、战锤（举械）、小盾（盾击）、长剑（单持 / 双手） */
        const cases = [
            {id: 'spear', mode: 'two_handed' as const},
            {id: 'war_hammer', mode: 'two_handed' as const},
            {id: 'shield_small', mode: 'one_handed' as const},
            {id: 'long_sword', mode: 'one_handed' as const},
            {id: 'long_sword', mode: 'two_handed' as const},
        ]
        for (const {id, mode} of cases) {
            const preset = weaponPresetOrDefault(id)
            const heavy = weaponAttacksOf(preset, mode).segments[`${id}_${mode}_heavy_1`]!
            const phases = resolvePhases(heavy.phases)
            const windup = phaseDurationOf(phases[0]!, heavy.duration, heavy.recovery)
            const total = heavy.duration + heavy.recovery
            const clipDuration = getAttackClipById(heavy.poseId).duration
            /* 松开蓄力后播放器按 dt 正常推进：预补偿 12 帧推进量，使末帧恰好停在目标进度 */
            const frames = 12
            const advance = frames / 60 / clipDuration
            const run = (overrides: Partial<AnimationContext>) => {
                const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
                model.equipWeapon({main: preset.mesh})
                const sys = createAppearanceSystem()
                /* 12 帧 > STATE_BLEND_DURATION，过渡混合已完成 */
                for (let i = 0; i < frames; i++) {
                    sys.update(1 / 60, model, 'attacking', makeCtx({
                        holdMode: mode,
                        attackSegment: heavy,
                        weaponHeld: true,
                        ...overrides,
                    }))
                }
                model.group.updateMatrixWorld(true)
                return model
            }
            for (const charge of [0.5, 1]) {
                const held = run({attackHolding: true, attackCharge: charge, attackPhase: 'windup'})
                const released = run({
                    attackHolding: false,
                    attackTotalProgress: Math.max(0, charge * windup / total - advance),
                    attackPhase: 'strike',
                })
                for (const axis of ['x', 'y', 'z'] as const) {
                    expect(
                        held.rightArmShoulder.rotation[axis],
                        `${id}/${mode}@${charge} 满蓄力与松手起点姿势跳变（${axis}）`,
                    ).toBeCloseTo(released.rightArmShoulder.rotation[axis], 3)
                }
                held.dispose()
                released.dispose()
            }
        }
    })

    it('切换惯用手后重建 clip（同动画键下镜像到左手持械姿势）', () => {
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        const idle = (handedness: 'right' | 'left', i: number): AnimationContext =>
            makeCtx({stateTime: i / 60, handedness, weaponHeld: true, holdMode: 'one_handed'})
        /* 右撇子：主手（解剖右）持械抬肩（WEAPON_READY_SHOULDER ≈ -0.45），副手垂摆 */
        for (let i = 0; i < 30; i++) sys.update(1 / 60, model, 'idle', idle('right', i))
        expect(model.rightArmShoulder.rotation.x).toBeLessThan(-0.3)
        expect(Math.abs(model.leftArmShoulder.rotation.x)).toBeLessThan(0.15)
        /* 切到左撇子：动画键（idle:one_handed）不变，但 handedness 变化须触发重解析为镜像 clip */
        for (let i = 30; i < 90; i++) sys.update(1 / 60, model, 'idle', idle('left', i))
        expect(model.leftArmShoulder.rotation.x).toBeLessThan(-0.3)
        expect(Math.abs(model.rightArmShoulder.rotation.x)).toBeLessThan(0.15)
        model.dispose()
    })

    it('倒地 / 起身按状态时长定位 clip（时长可配置时手脚与根旋转仍同拍）', () => {
        const makeModel = (): ReturnType<typeof createHumanoidModel> => createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const slow = makeModel()
        const fast = makeModel()
        const slowSys = createAppearanceSystem()
        const fastSys = createAppearanceSystem()
        /* 同一状态时间：getUpDuration = 1.2 的角色仍在推起段；0.6 的角色已站直 */
        for (let i = 0; i <= 36; i++) {
            const stateTime = i / 60
            slowSys.update(1 / 60, slow, 'getting_up', makeCtx({stateTime, stateDuration: 1.2}))
            fastSys.update(1 / 60, fast, 'getting_up', makeCtx({stateTime, stateDuration: 0.6}))
        }
        expect(Math.abs(slow.rightArmElbow.rotation.x)).toBeGreaterThan(0.2)
        expect(Math.abs(fast.rightArmElbow.rotation.x)).toBeLessThan(0.05)
        slow.dispose()
        fast.dispose()
    })

    it('falling 腿张开随水平速度（速度 0 vs 高速档，动画键切换生成不同 clip）', () => {
        const model = createHumanoidModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        /* 低速（tier 0）：legSpread = 0，髋 -0.15 */
        for (let i = 0; i < 10; i++) {
            sys.update(1 / 60, model, 'falling', makeCtx({stateTime: i / 60, horizontalSpeed: 0}))
        }
        const slowHip = model.rightLegHip.rotation.x
        /* 高速（tier 4）：legSpread = 0.16，髋 -0.31，动画键变化 → 重新生成 clip */
        for (let i = 0; i < 10; i++) {
            sys.update(1 / 60, model, 'falling', makeCtx({stateTime: i / 60, horizontalSpeed: 4}))
        }
        const fastHip = model.rightLegHip.rotation.x
        expect(Math.abs(fastHip - slowHip)).toBeGreaterThan(0.05)
        model.dispose()
    })
})
