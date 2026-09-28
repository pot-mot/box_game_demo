import {describe, it, expect} from 'vitest'
import {Group} from 'three'
import {BEHAVIORS} from './behaviors.ts'
import type {InteractableConfig, InteractableEntity, InteractableRuntimeContext} from './types.ts'
import {createInventory} from '../../inventory/inventory.ts'

const makeEntity = (config: InteractableConfig): InteractableEntity => ({
    id: 1,
    config,
    group: new Group(),
    body: {setNextKinematicTranslation: () => {}} as unknown as InteractableEntity['body'],
    colliders: [{setEnabled: () => {}} as unknown as InteractableEntity['colliders'][number]],
    progress: 0,
    target: 0,
    on: false,
    container: createInventory(0, 0),
    health: config.kind === 'breakable' ? config.health : 1,
    dead: false,
    momentaryTimer: 0,
    base: {x: 0, y: 0, z: 0},
    lastProgress: 0,
    meshDispose: () => {},
    rowText: '',
})

const makeCtx = (): {ctx: InteractableRuntimeContext; signals: Array<[string, boolean]>; despawned: number[]} => {
    const signals: Array<[string, boolean]> = []
    const despawned: number[] = []
    return {
        signals,
        despawned,
        ctx: {
            setSignal: (channel, on) => { signals.push([channel, on]) },
            player: undefined,
            hooks: {},
            despawn: (id) => { despawned.push(id) },
        },
    }
}

describe('交互物行为', () => {
    it('开关切换并发布信号', () => {
        const e = makeEntity({kind: 'switch', material: 'wood', size: [0.5, 0.8, 0.4], channel: 'ch1', mode: 'toggle'})
        const {ctx, signals} = makeCtx()
        BEHAVIORS.switch.interact?.(e, ctx)
        expect(e.on).toBe(true)
        expect(signals).toEqual([['ch1', true]])
        BEHAVIORS.switch.interact?.(e, ctx)
        expect(e.on).toBe(false)
        expect(signals).toEqual([['ch1', true], ['ch1', false]])
    })

    it('推门交互切换目标并在完全打开后禁用碰撞体', () => {
        const e = makeEntity({kind: 'push_door_single', material: 'wood', size: [0.15, 2, 1.2], channel: '', hingeQuarter: 0})
        let enabled = true
        e.colliders = [{setEnabled: (v: boolean) => { enabled = v }} as unknown as InteractableEntity['colliders'][number]]
        const {ctx} = makeCtx()
        BEHAVIORS.push_door_single.interact?.(e, ctx)
        expect(e.target).toBe(1)
        for (let i = 0; i < 200; i++) BEHAVIORS.push_door_single.update(1 / 60, e, ctx)
        expect(e.progress).toBeCloseTo(1)
        expect(enabled).toBe(false)
    })

    it('闸门按信号上升并同步运动学位移', () => {
        const e = makeEntity({kind: 'gate', material: 'rusty_iron', size: [2.4, 2.4, 0.3], channel: 'gate', travel: 2, speed: 2})
        let lastY = 0
        e.body = {setNextKinematicTranslation: (p: {x: number; y: number; z: number}) => { lastY = p.y }} as unknown as InteractableEntity['body']
        const {ctx} = makeCtx()
        BEHAVIORS.gate.onSignal?.(e, true, ctx)
        for (let i = 0; i < 120; i++) BEHAVIORS.gate.update(1 / 60, e, ctx)
        expect(e.progress).toBeCloseTo(1)
        expect(lastY).toBeCloseTo(2)
    })

    it('可破坏道具仅对允许来源扣血并移除', () => {
        const e = makeEntity({kind: 'breakable', material: 'brick', size: [0.8, 0.8, 0.8], channel: '', health: 20, breakableBy: ['melee']})
        const {ctx, despawned} = makeCtx()
        expect(BEHAVIORS.breakable.onAttacked?.(e, 'ranged', 'physical', 10, ctx)).toBe(false)
        expect(e.health).toBe(20)
        expect(BEHAVIORS.breakable.onAttacked?.(e, 'melee', 'physical', 25, ctx)).toBe(true)
        expect(e.dead).toBe(true)
        expect(despawned).toEqual([1])
    })

    it('可交互类型提示存在，可破坏道具不可交互', () => {
        const save = makeEntity({kind: 'save_point', material: 'rusty_iron', size: [0.8, 1.2, 0.8], channel: '', name: '篝火'})
        expect(BEHAVIORS.save_point.interactable).toBe(true)
        expect(BEHAVIORS.save_point.prompt(save)).toBeDefined()
        const br = makeEntity({kind: 'breakable', material: 'brick', size: [0.8, 0.8, 0.8], channel: '', health: 10, breakableBy: ['melee']})
        expect(BEHAVIORS.breakable.interactable).toBe(false)
        expect(BEHAVIORS.breakable.prompt(br)).toBeUndefined()
    })
})
