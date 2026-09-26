import {describe, it, expect, beforeAll, vi} from 'vitest'
import {Vector3} from 'three'
import type {AnimationContext} from './types.ts'
import {createAppearanceSystem} from './system.ts'
import {createCharacterModel} from './model.ts'
import {defaultHoldMode, weaponPresetOrDefault} from '../../../character/weapon/catalog.ts'
import {orderedSegments} from '../../../character/weapon/attack_chain.ts'
import {createWeaponRuntime} from '../../../character/weapon/weapon_runtime.ts'

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
    attackSegment: undefined,
    attackPhase: undefined,
    attackPhaseProgress: 0,
    attackTotalProgress: 0,
    attackPhaseIndex: 0,
    weaponHeld: false,
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

    it('双手共持（含远程，含缩放模型）：左手吸附各武器对应的副握点，且左肘朝下（不生反关节）', () => {
        const ids = ['heavy_sword', 'spear', 'war_hammer', 'longbow', 'crossbow', 'shotgun', 'staff']
        /* scale = 1（play/edit）与 1.3（展示模式 ACTOR_SCALE）：IK 目标/臂展须在同一骨架空间计算，
         * 且模型根位置（play 中为 body 位置）不得引入偏移（残差按模型空间归一后两者一致） */
        for (const scale of [1, 1.3]) {
            for (const id of ids) {
                const preset = weaponPresetOrDefault(id)
                const segments = orderedSegments(createWeaponRuntime(id).attacks)
                for (const seg of segments) {
                    const model = createCharacterModel({speed: 6, jumpHeight: 2, scale}, 0)
                    /* 模拟生产：模型根由物理 body 管理（非原点） */
                    model.group.position.set(3, 1, -2)
                    model.equipWeapon({main: preset.mesh, offhand: preset.offhandMesh})
                    const sys = createAppearanceSystem()
                    const total = seg.duration + seg.recovery
                    let maxDist = 0
                    let minElbowDy = 1
                    for (let i = 0; i <= 20; i++) {
                        const t = Math.min(i / 60, total)
                        sys.update(1 / 60, model, 'attacking', makeCtx({
                            stateTime: t,
                            holdMode: defaultHoldMode(preset),
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
