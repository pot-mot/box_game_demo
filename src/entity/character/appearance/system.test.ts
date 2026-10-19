import {describe, it, expect, beforeAll, vi} from 'vitest'
import {Vector3} from 'three'
import type {AnimationContext} from './types.ts'
import {createAppearanceSystem} from './system.ts'
import {createCharacterModel} from './model.ts'
import {weaponAttacksOf, weaponPresetOrDefault} from '../../../character/weapon/catalog.ts'
import {orderedSegments} from '../../../character/weapon/attack_chain.ts'
import {phaseDurationOf, resolvePhases} from '../../../character/combat/attack_phases.ts'
import {getAttackClipById} from './clips/attack_clips.ts'

/** happy-dom 无 2d 上下文：stub canvas.getContext（脸部纹理绘制用） */
const stubCanvas2d = (): void => {
    const fakeCtx = new Proxy({}, {
        get: (_t, prop) => {
            if (prop === 'canvas') return null
            return (): void => {}
        },
        set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = originalCreate(tag, options)
        if (tag === 'canvas') {
            Object.defineProperty(el, 'getContext', {value: () => fakeCtx})
        }
        return el
    })
}

const makeCtx = (overrides: Partial<AnimationContext> = {}): AnimationContext => ({
    stateTime: 0,
    horizontalSpeed: 0,
    holdMode: 'one_handed',
    handedness: 'right',
    attackSegment: undefined,
    attackPhase: undefined,
    attackPhaseProgress: 0,
    attackTotalProgress: 0,
    attackPhaseIndex: 0,
    attackCharge: 0,
    attackHolding: false,
    weaponHeld: false,
    shieldHands: {main: false, off: false},
    ...overrides,
})

describe('外观系统基础动画播放（play() 修复回归）', () => {
    beforeAll(() => {
        stubCanvas2d()
    })

    it('进入 idle 后多帧推进：头部呼吸摆动（证明 clip 播放器在播放，未修复时静止首帧）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
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
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'walking', makeCtx({stateTime: i / 60, horizontalSpeed: 3.7}))
        }
        /* 腿应摆动（sin(t)·0.5），非静止 0 */
        expect(Math.abs(model.rightLegHip.rotation.x)).toBeGreaterThan(1e-4)
        model.dispose()
    })

    it('格挡时叠加下半身行走步态（水平移动 → 双腿摆动；静止 → 静态格挡腿姿）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        const sys = createAppearanceSystem()
        /* 静止格挡：双腿保持静态格挡姿态（rightLegHip.rx = 0.06） */
        for (let i = 0; i < 10; i++) sys.update(1 / 60, model, 'blocking', makeCtx({stateTime: i / 60, horizontalSpeed: 0}))
        const staticHip = model.rightLegHip.rotation.x
        /* 移动格挡：叠加行走步态覆盖双腿，髋角随步态相位摆动 */
        let varied = false
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'blocking', makeCtx({stateTime: i / 60, horizontalSpeed: 3.7}))
            if (Math.abs(model.rightLegHip.rotation.x - staticHip) > 1e-3) varied = true
        }
        expect(varied).toBe(true)
        model.dispose()
    })

    it('重击蓄力保持时叠加下半身行走步态（attackHolding + 移动 → 双腿摆动）', () => {
        const preset = weaponPresetOrDefault('long_sword')
        const seg = orderedSegments(weaponAttacksOf(preset, 'one_handed'))
            .find(s => s.id === 'long_sword_one_handed_heavy_1')!
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
        model.equipWeapon({main: preset.mesh})
        const sys = createAppearanceSystem()
        let varied = false
        for (let i = 0; i < 30; i++) {
            sys.update(1 / 60, model, 'attacking', makeCtx({
                stateTime: i / 60,
                horizontalSpeed: 3.7,
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

    it('双手共持（含远程，含缩放模型）：左手吸附各武器对应的副握点，且左肘朝下（不生反关节）', () => {
        /* 全部支持双手共持的武器：6 近战 + 4 远程；武器按显式 two_handed 模式解析连段 */
        const ids = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer', 'longbow', 'crossbow', 'shotgun', 'staff']
        /* scale = 1（play/edit）与 1.3（展示模式 ACTOR_SCALE）：IK 目标/臂展须在同一骨架空间计算，
         * 且模型根位置（play 中为 body 位置）不得引入偏移（残差按模型空间归一后两者一致） */
        for (const scale of [1, 1.3]) {
            for (const id of ids) {
                const preset = weaponPresetOrDefault(id)
                const segments = orderedSegments(weaponAttacksOf(preset, 'two_handed'))
                for (const seg of segments) {
                    const model = createCharacterModel({speed: 6, jumpHeight: 2, scale}, 0)
                    /* 模拟生产：模型根由物理 body 管理（非原点） */
                    model.group.position.set(3, 1, -2)
                    /* 双手共持：不装备副手武器（副手挂背同样不干扰 IK，但此测试聚焦徒手贴合） */
                    model.equipWeapon({main: preset.mesh})
                    const sys = createAppearanceSystem()
                    const total = seg.duration + seg.recovery
                    const frames = Math.ceil(total * 60)
                    let maxDist = 0
                    let minElbowDy = 1
                    for (let i = 0; i <= frames; i++) {
                        const t = Math.min(i / 60, total)
                        sys.update(1 / 60, model, 'attacking', makeCtx({
                            stateTime: t,
                            holdMode: 'two_handed',
                            attackSegment: seg,
                            attackPhase: 'aim',
                            attackPhaseProgress: 0.5,
                            attackTotalProgress: t / total,
                            weaponHeld: true,
                        }))
                        model.group.updateMatrixWorld(true)
                        const shoulder = model.leftArmShoulder.getWorldPosition(new Vector3())
                        const elbow = model.leftArmElbow.getWorldPosition(new Vector3())
                        const hand = model.leftWeaponMount.getWorldPosition(new Vector3())
                        const supportGrip = model.weaponGroup!.localToWorld(
                            new Vector3(0, model.weaponSupportGripOffset, 0),
                        )
                        maxDist = Math.max(maxDist, hand.distanceTo(supportGrip))
                        /* 肘在「肩→手」垂面上的方向：y 分量应为负（朝下，非反折朝上/后） */
                        const axis = hand.clone().sub(shoulder).normalize()
                        const elbowPerp = elbow.clone().sub(shoulder)
                        elbowPerp.addScaledVector(axis, -elbowPerp.dot(axis)).normalize()
                        minElbowDy = Math.min(minElbowDy, elbowPerp.y)
                    }
                    /* 全部攻击姿势中左手贴近各武器的副握点（残差按 scale 归一到模型空间），左肘始终朝下 */
                    expect(maxDist / scale, `${seg.id}@${scale}× 左手未贴近副握点`).toBeLessThan(0.18)
                    expect(minElbowDy, `${seg.id}@${scale}× 左肘反关节`).toBeLessThan(-0.3)
                    model.dispose()
                }
            }
        }
    })

    it('双手共持蓄力：整段蓄力进程中左手持续吸附副握点，且左肘朝下', () => {
        const ids = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer']
        for (const id of ids) {
            const preset = weaponPresetOrDefault(id)
            const heavy = weaponAttacksOf(preset, 'two_handed').segments[`${id}_two_handed_heavy_1`]!
            expect(heavy.chargeFullTime, id).toBe(1)
            const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
            model.equipWeapon({main: preset.mesh})
            const sys = createAppearanceSystem()
            let maxDist = 0
            let minElbowDy = 1
            for (let i = 0; i <= 20; i++) {
                const charge = i / 20
                for (let k = 0; k < 2; k++) {
                    sys.update(1 / 60, model, 'attacking', makeCtx({
                        holdMode: 'two_handed',
                        attackSegment: heavy,
                        attackPhase: 'strike',
                        attackHolding: true,
                        attackCharge: charge,
                        weaponHeld: true,
                    }))
                }
                model.group.updateMatrixWorld(true)
                const shoulder = model.leftArmShoulder.getWorldPosition(new Vector3())
                const elbow = model.leftArmElbow.getWorldPosition(new Vector3())
                const hand = model.leftWeaponMount.getWorldPosition(new Vector3())
                const supportGrip = model.weaponGroup!.localToWorld(new Vector3(0, model.weaponSupportGripOffset, 0))
                maxDist = Math.max(maxDist, hand.distanceTo(supportGrip))
                const axis = hand.clone().sub(shoulder).normalize()
                const elbowPerp = elbow.clone().sub(shoulder)
                elbowPerp.addScaledVector(axis, -elbowPerp.dot(axis)).normalize()
                minElbowDy = Math.min(minElbowDy, elbowPerp.y)
            }
            expect(maxDist, `${id} 蓄力时左手未贴近副握点`).toBeLessThan(0.18)
            expect(minElbowDy, `${id} 蓄力时左肘反关节`).toBeLessThan(-0.3)
            model.dispose()
        }
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
            const clipDuration = Math.max(...heavy.poses.map(pose => getAttackClipById(pose.poseId).duration))
            /* 松开蓄力后播放器按 dt 正常推进：预补偿 12 帧推进量，使末帧恰好停在目标进度 */
            const frames = 12
            const advance = frames / 60 / clipDuration
            const run = (overrides: Partial<AnimationContext>) => {
                const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
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

    it('双手共持：待机 / 行走等非攻击持械状态也吸附副握点（问题 1 回归）', () => {
        const ids = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer', 'longbow', 'crossbow', 'shotgun', 'staff']
        for (const state of ['idle', 'walking'] as const) {
            for (const id of ids) {
                const preset = weaponPresetOrDefault(id)
                const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
                model.equipWeapon({main: preset.mesh})
                const sys = createAppearanceSystem()
                let maxDist = 0
                let minElbowDy = 1
                for (let i = 0; i < 30; i++) {
                    sys.update(1 / 60, model, state, makeCtx({
                        stateTime: i / 60,
                        horizontalSpeed: state === 'walking' ? 3.7 : 0,
                        holdMode: 'two_handed',
                        weaponHeld: true,
                    }))
                    model.group.updateMatrixWorld(true)
                    const shoulder = model.leftArmShoulder.getWorldPosition(new Vector3())
                    const elbow = model.leftArmElbow.getWorldPosition(new Vector3())
                    const hand = model.leftWeaponMount.getWorldPosition(new Vector3())
                    const supportGrip = model.weaponGroup!.localToWorld(new Vector3(0, model.weaponSupportGripOffset, 0))
                    maxDist = Math.max(maxDist, hand.distanceTo(supportGrip))
                    /* 肘在「肩→手」垂面上的方向：y 分量应为负（朝下，非反折朝上/后） */
                    const axis = hand.clone().sub(shoulder).normalize()
                    const elbowPerp = elbow.clone().sub(shoulder)
                    elbowPerp.addScaledVector(axis, -elbowPerp.dot(axis)).normalize()
                    minElbowDy = Math.min(minElbowDy, elbowPerp.y)
                }
                /* 待机 / 行走同样让副手吸附副握点，且左肘朝下（不生反关节） */
                expect(maxDist, `${id}@${state} 副手未吸附副握点`).toBeLessThan(0.18)
                expect(minElbowDy, `${id}@${state} 左肘反关节`).toBeLessThan(-0.3)
                model.dispose()
            }
        }
    })

    it('切换惯用手后重建 clip（同动画键下镜像到左手持械姿势）', () => {
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
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
        const makeModel = (): ReturnType<typeof createCharacterModel> => createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
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
        const model = createCharacterModel({speed: 6, jumpHeight: 2, scale: 1}, 0)
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
