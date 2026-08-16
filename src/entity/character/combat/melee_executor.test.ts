import {describe, it, expect} from 'vitest'
import {targetHitBoxHalves, testMeleeHit, testAttackDetect, attackDetectOBB, meleeDetectRange} from './melee_executor.ts'
import {MELEE_ARM_FORWARD_REACH, ATTACK_DETECT_REACH_MARGIN} from './constants.ts'
import {createWeaponMesh} from '../appearance/weapon_mesh.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'

/** 组装「yaw 旋转 + 平移」的 4×4 列主序矩阵（与 Three.js matrixWorld.elements 布局一致） */
const yawMatrix = (px: number, py: number, pz: number, yaw: number): readonly number[] => {
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    return [
        cos, 0, -sin, 0,
        0, 1, 0, 0,
        sin, 0, cos, 0,
        px, py, pz, 1,
    ]
}

/* 武器本地命中箱夹具：中心在武器前方（local +Z）0.2 处 */
const localCenter = {x: 0, y: 0.5, z: 0.2}
const localHalf = {x: 0.15, y: 0.5, z: 0.15}

describe('targetHitBoxHalves', () => {
    it('与碰撞箱同尺寸（scale=1，竖直胶囊包围盒）', () => {
        const th = targetHitBoxHalves(1)
        expect(th.x).toBeCloseTo(CHARACTER_BASE_SIZE.width / 2)
        expect(th.y).toBeCloseTo(CHARACTER_BASE_SIZE.height / 2)
        expect(th.z).toBeCloseTo(CHARACTER_BASE_SIZE.depth / 2)
    })

    it('随 scale 等比缩放', () => {
        const th = targetHitBoxHalves(2)
        expect(th.x).toBeCloseTo(CHARACTER_BASE_SIZE.width)
        expect(th.y).toBeCloseTo(CHARACTER_BASE_SIZE.height)
        expect(th.z).toBeCloseTo(CHARACTER_BASE_SIZE.depth)
    })
})

describe('testMeleeHit（武器 OBB × 受击箱 OBB）', () => {
    it('武器箱与受击箱重叠时命中，远离时不命中', () => {
        /* yaw=0：本地盒中心落于世界 (0, 0.5, 0.2)，z 覆盖 0.05–0.35 */
        expect(testMeleeHit(yawMatrix(0, 0, 0, 0), localCenter, localHalf, {x: 0, y: 0, z: 0.2}, 1, 0)).toBe(true)
        expect(testMeleeHit(yawMatrix(0, 0, 0, 0), localCenter, localHalf, {x: 0, y: 0, z: -0.5}, 1, 0)).toBe(false)
    })

    it('高度方向分离时不命中', () => {
        /* 武器箱 y 覆盖 0–1.0；目标抬高后受击箱 y 覆盖 1.5–2.5 */
        expect(testMeleeHit(yawMatrix(0, 0, 0, 0), localCenter, localHalf, {x: 0, y: 2, z: 0.2}, 1, 0)).toBe(false)
    })

    it('判定箱随武器姿态旋转：转 90° 后命中区从 +Z 转到 +X', () => {
        /* yaw=π/2：本地 +Z 偏移转为世界 +X，盒中心落于 (0.2, 0.5, 0) */
        expect(testMeleeHit(yawMatrix(0, 0, 0, Math.PI / 2), localCenter, localHalf, {x: 0.25, y: 0, z: 0}, 1, 0)).toBe(true)
        /* 原 +Z 方向的目标转出覆盖区 */
        expect(testMeleeHit(yawMatrix(0, 0, 0, Math.PI / 2), localCenter, localHalf, {x: 0, y: 0, z: 0.25}, 1, 0)).toBe(false)
    })

    it('受击箱随目标朝向旋转：同一武器位姿，目标转 90° 后命中状态翻转', () => {
        /* 武器箱窄（x 半长 0.15）置于目标侧方：目标 width > depth，
         * 朝向 +Z 时侧方为宽面（命中），转 90° 后侧方变为窄面（未命中） */
        const sideBoxCenter = {x: 0.2, y: 0.5, z: 0}
        const sideBoxHalf = {x: 0.1, y: 0.5, z: 0.1}
        const m = yawMatrix(0, 0, 0, 0)
        expect(testMeleeHit(m, sideBoxCenter, sideBoxHalf, {x: 0, y: 0, z: 0}, 1, 0)).toBe(true)
        expect(testMeleeHit(m, sideBoxCenter, sideBoxHalf, {x: 0, y: 0, z: 0}, 1, Math.PI / 2)).toBe(false)
    })
})

describe('meleeDetectRange / 武器命中箱 reach（检测深度由武器实际打击距离驱动）', () => {
    it('reach = 命中箱沿武器轴最大前伸量（center.y + half.y）', () => {
        const sword = createWeaponMesh({id: 'sword', bladeLen: 0.5, color: 0, gripColor: 0})
        expect(sword.hitBox.reach).toBeCloseTo(sword.hitBox.center.y + sword.hitBox.half.y)
        sword.cleanup()
    })

    it('长杆武器 reach 显著大于短刃（不同武器攻击距离差异）', () => {
        const sword = createWeaponMesh({id: 'sword', bladeLen: 0.5, color: 0, gripColor: 0})
        const spear = createWeaponMesh({id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0, headColor: 0})
        expect(spear.hitBox.reach).toBeGreaterThan(sword.hitBox.reach * 2)
        sword.cleanup()
        spear.cleanup()
    })

    it('检测深度 = 臂前伸量 + 武器 reach + 触发余量，随 scale 缩放', () => {
        const base = MELEE_ARM_FORWARD_REACH + 0.46 + ATTACK_DETECT_REACH_MARGIN
        expect(meleeDetectRange(0.46, 1)).toBeCloseTo(base)
        expect(meleeDetectRange(0.46, 2)).toBeCloseTo(base * 2)
    })

    it('检测深度与实际命中距离同量级（远小于旧 weapon.range 的 1.5）', () => {
        const sword = createWeaponMesh({id: 'sword', bladeLen: 0.5, color: 0, gripColor: 0})
        expect(meleeDetectRange(sword.hitBox.reach, 1)).toBeLessThan(1.2)
        sword.cleanup()
    })
})

describe('attackDetectOBB / testAttackDetect（攻击检测箱）', () => {
    /* scale=1 身体半宽 0.125 / 半高 0.5 / 半深 ≈ 0.081 */
    it('几何参数：覆盖身前 range、身后少量余量、两侧略宽于身体', () => {
        const box = attackDetectOBB({x: 0, y: 0, z: 0}, 1.5, 1, 0)
        const bd = CHARACTER_BASE_SIZE.depth / 2
        /* 半深 = (range + bd + back)/2 > range/2；中心前移 = (range - bd - back)/2 */
        expect(box.half.z).toBeGreaterThan(1.5 / 2)
        expect(box.half.z * 2 - 1.5).toBeCloseTo(bd + 0.1)
        expect(box.half.x).toBeGreaterThan(CHARACTER_BASE_SIZE.width / 2)
        expect(box.half.y).toBeGreaterThan(CHARACTER_BASE_SIZE.height / 2)
    })

    it('身前目标命中，超出 range 未命中', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, 0, {x: 0, y: 0, z: 1.0}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, 0, {x: 0, y: 0, z: 1.7}, 1, 0)).toBe(false)
    })

    it('身后盲区：仅覆盖贴背余量', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, 0, {x: 0, y: 0, z: -0.15}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, 0, {x: 0, y: 0, z: -0.5}, 1, 0)).toBe(false)
    })

    it('侧面覆盖略宽于身体碰撞箱', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, 0, {x: 0.3, y: 0, z: 0}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, 0, {x: 0.4, y: 0, z: 0}, 1, 0)).toBe(false)
    })

    it('深度随武器 range 变化（不同武器攻击距离差异）', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 2.5, 1, 0, {x: 0, y: 0, z: 2.2}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.0, 1, 0, {x: 0, y: 0, z: 2.2}, 1, 0)).toBe(false)
    })

    it('检测箱随角色朝向旋转：转 90° 后前方由 +Z 变为 +X', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, Math.PI / 2, {x: 1.0, y: 0, z: 0}, 1, 0)).toBe(true)
        /* 原 +Z 方向变为侧方，超出侧向半宽 */
        expect(testAttackDetect({x: 0, y: 0, z: 0}, 1.5, 1, Math.PI / 2, {x: 0, y: 0, z: 1.0}, 1, 0)).toBe(false)
    })
})
