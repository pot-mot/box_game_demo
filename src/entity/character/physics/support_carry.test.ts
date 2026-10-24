import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, setMovingSupport} from '../../../physics/world.ts'
import {clearAllForces} from '../../../physics/rapier_utils.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, FIXED_TIME_STEP, MAX_SUB_STEPS} from '../../../physics/constants.ts'
import {setupInteractables, defaultInteractableConfig} from '../../interactable/index.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/** happy-dom 不支持 canvas 2d：用 Proxy 提供任意方法的空实现（角色脸部贴图 + 交互物表面材质均需要） */
const canvasCtxStub = (): unknown => new Proxy({}, {
    get: (_t, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({addColorStop: () => {}})
        if (prop === 'createPattern') return () => ({})
        if (prop === 'getImageData' || prop === 'createImageData') return () => ({data: new Uint8ClampedArray(4), width: 1, height: 1})
        if (prop === 'measureText') return () => ({width: 0})
        if (prop === 'canvas') return {width: 256, height: 256}
        return () => {}
    },
    set: () => true,
})
const originalGetContext = HTMLCanvasElement.prototype.getContext

const config = (): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
})

/** 建立共享世界 + 角色系统 + 一块运动学平台（顶面 y=0.5），并在平台 handle 上注册移动支撑速度 */
const setupWithSupport = (support: {x: number; y: number; z: number} | undefined): {
    system: CharacterEntitySystem
    entity: ReturnType<CharacterEntitySystem['getAll']>[number]
    platformHandle: number
    step: (frames: number) => void
} => {
    const scene = new Scene()
    const shared = createSharedWorld()
    shared.eventBus.onStepEnd(() => clearAllForces(shared.world))
    const system = setupCharacterEntities(scene, shared)

    const body = shared.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.4, 0))
    shared.world.createCollider(
        RAPIER.ColliderDesc.cuboid(10, 0.1, 10)
            .setFriction(0.5)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'ground'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
    )
    if (support !== undefined) {
        setMovingSupport(shared, body.handle, {v: support, w: {x: 0, y: 0, z: 0}})
    }
    const {id} = system.add(config(), 0, 0.5, 0)
    const entity = system.getAll().find(e => e.state.identity.id === id)!
    const step = (frames: number): void => {
        for (let i = 0; i < frames; i++) {
            /* 生产顺序：每帧步进前先位置携带乘客 */
            system.applySupportCarry(1 / 60)
            shared.world.step(shared.eventQueue)
            shared.eventBus.drain()
            system.update(1 / 60)
        }
    }
    return {system, entity, platformHandle: body.handle, step}
}

describe('移动支撑携带（物理接触 + 速度注册表）', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value: () => canvasCtxStub(), configurable: true, writable: true,
        })
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value: originalGetContext, configurable: true, writable: true,
        })
        warnSpy.mockRestore()
    })

    it('被支撑的角色随平台平移（位置携带，步进前对齐；不依赖速度累加）', () => {
        const {entity, platformHandle, step} = setupWithSupport({x: 2, y: 0, z: 0})
        const x0 = entity.body.translation().x
        step(30)
        expect(entity.state.physics.groundBodyHandle).toBe(platformHandle)
        /* 30 帧 @ 2 m/s ≈ 1m 的位移（位置携带），且非速度残留 */
        expect(entity.body.translation().x - x0).toBeGreaterThan(0.5)
    })

    it('未注册支撑的平台不携带（静止角色位置不动）', () => {
        const {entity, step} = setupWithSupport(undefined)
        const x0 = entity.body.translation().x
        step(30)
        expect(Math.abs(entity.body.translation().x - x0)).toBeLessThan(0.05)
    })

    it('升降梯上升：乘客随平台平稳移动（多物理子步下无顶起抖动）', () => {
        const scene = new Scene()
        const shared = createSharedWorld()
        shared.eventBus.onStepEnd(() => clearAllForces(shared.world))
        const system: CharacterEntitySystem = setupCharacterEntities(scene, shared)
        const interactables = setupInteractables(scene, shared)
        const {id: liftId} = interactables.add(defaultInteractableConfig('elevator'), 0, 0, 0)
        const lift = interactables.getById(liftId)!
        /* 默认 elevator：size [2, 0.25, 2]、travel 4、speed 1.2；乘客脚底站到平台顶面 */
        const sizeY = 0.25
        const travel = 4
        const {id} = system.add(config(), 0, sizeY, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        interactables.activate(liftId)

        /* 每帧 2 个物理子步（delta 略大于 1/60，旧实现会在此抖动） */
        const frameDt = 0.0175
        const gaps: number[] = []
        for (let i = 0; i < 60; i++) {
            /* 生产顺序：平台瞬移 + 注册速度 → 步进前携带乘客 → 物理子步 → 角色更新 */
            interactables.update(frameDt)
            system.applySupportCarry(frameDt)
            const total = Math.min(Math.max(1, Math.ceil(frameDt / FIXED_TIME_STEP)), MAX_SUB_STEPS)
            for (let s = 0; s < total; s++) { shared.world.step(shared.eventQueue); shared.eventBus.drain() }
            system.update(frameDt)
            const top = lift.base.y + lift.progress * travel + sizeY
            if (i >= 25) gaps.push((entity.body.translation().y - sizeY) - top)
        }
        const amplitude = Math.max(...gaps) - Math.min(...gaps)
        expect(lift.progress).toBeGreaterThan(0)
        /* 相对平台顶面的高低差波动极小（旧实现约 9cm 抖动） */
        expect(amplitude).toBeLessThan(0.02)
    })
})
