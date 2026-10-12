import {beforeAll, describe, expect, it} from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import {BoxGeometry, Mesh, MeshBasicMaterial, type Object3D} from 'three'
import {createRapierRayCaster} from '../../../physics/raycast.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../physics/constants.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import {initRapier, createHarnessWorld, stepWorld, makeChar, type HarnessWorld} from './harness.ts'
import {createRapierLosRayCaster, createRapierNavRayCaster} from './rapier_queries.ts'
import {createRapierLineOfSight} from '../ai/line_of_sight.ts'
import {createRapierNavSensor} from '../ai/nav/sensor.ts'
import type {NavConfig} from '../ai/nav/types.ts'
import type {CharacterEntity} from '../../../character/types.ts'

const CONFIG: NavConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}

/** 固定盒碰撞体（场景几何），category 标注语义类别 */
const addFixedBox = (
    hw: HarnessWorld,
    x: number, y: number, z: number,
    hx: number, hy: number, hz: number,
    category: 'box' | 'character',
): void => {
    const body = hw.shared.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, category)),
        body,
    )
}

/** 传感器盒碰撞体（投掷物 / 掉落物 / 水域语义）：不应阻挡感知 */
const addFixedBoxSensor = (
    hw: HarnessWorld,
    x: number, y: number, z: number,
    hx: number, hy: number, hz: number,
): void => {
    const body = hw.shared.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setSensor(true)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box')),
        body,
    )
}

/** 固定 trimesh 竖直墙（x=1.0，跨度 y∈[0,3]、z∈[-1,1]），用于验证 trimesh 顶部高度推断 */
const addFixedTrimeshWall = (hw: HarnessWorld): void => {
    const verts = new Float32Array([
        1.0, 0, -1,
        1.0, 3, -1,
        1.0, 3, 1,
        1.0, 0, 1,
    ])
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3])
    const body = hw.shared.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.trimesh(verts, idx)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box')),
        body,
    )
}

/** 造一个带可解析 mesh 的测试角色（mesh → body.handle 供射线排除自身） */
const makeResolvableChar = (hw: HarnessWorld, x: number, y: number, z: number): {char: CharacterEntity; resolve: (m: Object3D | null) => number | undefined} => {
    const char = makeChar(hw, 1, x, y, z)
    char.mesh = new Mesh(new BoxGeometry(0.25, 1, 0.1625), new MeshBasicMaterial())
    const resolve = (m: Object3D | null): number | undefined => (m === char.mesh ? char.body.handle : undefined)
    return {char, resolve}
}

describe('Rapier 射线后端（castRay）', () => {
    beforeAll(async () => { await initRapier() })

    it('castOne 命中碰撞体并给出世界法线 / 类别 / 顶部高度', () => {
        const hw = createHarnessWorld()
        addFixedBox(hw, 2, 1, 0, 0.5, 1, 0.5, 'box')
        stepWorld(hw)

        const caster = createRapierRayCaster(hw.shared)
        const hit = caster.castOne(0, 1, 0, 1, 0, 0, 10)
        expect(hit).toBeDefined()
        expect(hit!.toi).toBeCloseTo(1.5, 3)   // 盒前缘 x=1.5
        expect(hit!.normalY).toBeCloseTo(0, 3)  // 竖直面法线水平
        expect(hit!.category).toBe('box')
        expect(hit!.topY).toBeCloseTo(2, 3)     // 顶面 y=2
    })

    it('castOne 无命中返回 undefined', () => {
        const hw = createHarnessWorld()
        stepWorld(hw)
        const caster = createRapierRayCaster(hw.shared)
        /* 朝 +Y 向上：世界只有地面，应无命中 */
        expect(caster.castOne(0, 1, 0, 0, 1, 0, 5)).toBeUndefined()
    })
})

describe('Rapier 视线后端（排除自身）', () => {
    beforeAll(async () => { await initRapier() })

    it('无遮挡时 hasLOS 为 true（发射者自身被排除，不自遮挡）', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 1, 0.6, 0)
        stepWorld(hw)
        const los = createRapierLineOfSight(createRapierLosRayCaster(hw.shared, resolve))
        const p = char.body.translation()
        expect(los.hasLOS(p.x, p.y, p.z, p.x + 0.5, p.y, p.z, undefined, char.mesh)).toBe(true)
    })

    it('被墙遮挡时 hasLOS 为 false', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedBox(hw, 1.5, 1.5, 0, 0.15, 1.5, 1, 'box')
        stepWorld(hw)
        const los = createRapierLineOfSight(createRapierLosRayCaster(hw.shared, resolve))
        const p = char.body.translation()
        expect(los.hasLOS(p.x, p.y, p.z, p.x + 3, p.y, p.z, undefined, char.mesh)).toBe(false)
    })

    it('传感器不遮挡视线（hasLOS 保持 true）', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedBoxSensor(hw, 1.5, 0.6, 0, 0.5, 0.5, 0.5)
        stepWorld(hw)
        const los = createRapierLineOfSight(createRapierLosRayCaster(hw.shared, resolve))
        const p = char.body.translation()
        expect(los.hasLOS(p.x, p.y, p.z, p.x + 3, p.y, p.z, undefined, char.mesh)).toBe(true)
    })
})

describe('Rapier 导航后端', () => {
    beforeAll(async () => { await initRapier() })

    it('空场地上单角色 → clear（地形 / 地面查询正常，自身被排除）', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        stepWorld(hw)
        const sensor = createRapierNavSensor(createRapierNavRayCaster(hw.shared, resolve))
        const out = sensor.sense(char, 1, 0, CONFIG)
        expect(out.result).toBe('clear')
        expect(out.groundAhead).toBe(true)
    })

    it('前方高墙 → blocked_wall', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedBox(hw, 1.5, 1.5, 0, 0.15, 1.5, 1, 'box')
        stepWorld(hw)
        const sensor = createRapierNavSensor(createRapierNavRayCaster(hw.shared, resolve))
        expect(sensor.sense(char, 1, 0, CONFIG).result).toBe('blocked_wall')
    })

    it('前方矮箱 → blocked_low', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedBox(hw, 1.0, 0.5, 0, 0.2, 0.5, 0.5, 'box')
        stepWorld(hw)
        const sensor = createRapierNavSensor(createRapierNavRayCaster(hw.shared, resolve))
        expect(sensor.sense(char, 1, 0, CONFIG).result).toBe('blocked_low')
    })

    it('前方角色（矮于跳高）→ 强制 blocked_wall', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedBox(hw, 1.0, 0.5, 0, 0.125, 0.5, 0.125, 'character')
        stepWorld(hw)
        const sensor = createRapierNavSensor(createRapierNavRayCaster(hw.shared, resolve))
        expect(sensor.sense(char, 1, 0, CONFIG).result).toBe('blocked_wall')
    })

    it('前方高 trimesh 墙 → blocked_wall（trimesh 顶部高度由顶点 AABB 推断，不退化为墙底）', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedTrimeshWall(hw)
        stepWorld(hw)
        const sensor = createRapierNavSensor(createRapierNavRayCaster(hw.shared, resolve))
        expect(sensor.sense(char, 1, 0, CONFIG).result).toBe('blocked_wall')
    })

    it('前方传感器（投掷物 / 掉落物语义）→ clear（传感器不阻挡感知）', () => {
        const hw = createHarnessWorld()
        const {char, resolve} = makeResolvableChar(hw, 0, 0.6, 0)
        addFixedBoxSensor(hw, 1.0, 0.5, 0, 0.3, 0.5, 0.3)
        stepWorld(hw)
        const sensor = createRapierNavSensor(createRapierNavRayCaster(hw.shared, resolve))
        expect(sensor.sense(char, 1, 0, CONFIG).result).toBe('clear')
    })
})
