import {describe, it, expect, vi} from 'vitest'
import {targetHitBoxHalves, testMeleeHit, testAttackDetect, attackDetectOBB, createMeleeExecutor} from './melee_executor.ts'
import {createWeaponMesh} from '../appearance/weapon_mesh.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import type {MeleeDetectBox} from '../../../character/weapon/melee_weapon.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import type {ExecutorContext} from '../../../character/combat/executor.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type RAPIER from '@dimforge/rapier3d-compat'
import {buildMeleeSkillSlots} from '../../../character/combat/melee_skill.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'

/* 攻击检测箱夹具（与 long_sword / spear 预设一致）：前缘 = offset.z + size.z/2 */
const swordDetectBox: MeleeDetectBox = {size: {x: 0.45, y: 1.1, z: 1.3}, offset: {x: 0, y: 0, z: 0.45}}
const spearDetectBox: MeleeDetectBox = {size: {x: 0.4, y: 1.1, z: 2.1}, offset: {x: 0, y: 0, z: 0.85}}

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

describe('武器命中箱 reach（命中箱前伸量几何属性）', () => {
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
})

describe('attackDetectOBB / testAttackDetect（攻击检测箱由武器 detectBox 驱动）', () => {
    it('几何参数：半长 = size/2，中心 = 身体位置 + 偏移（yaw=0 时沿 +Z）', () => {
        const box = attackDetectOBB({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0)
        expect(box.half.x).toBeCloseTo(0.45 / 2)
        expect(box.half.y).toBeCloseTo(1.1 / 2)
        expect(box.half.z).toBeCloseTo(1.3 / 2)
        expect(box.center.x).toBeCloseTo(0)
        expect(box.center.y).toBeCloseTo(0)
        expect(box.center.z).toBeCloseTo(0.45)
    })

    it('尺寸与偏移随角色 scale 等比缩放', () => {
        const box = attackDetectOBB({x: 0, y: 0, z: 0}, swordDetectBox, 2, 0)
        expect(box.half.z).toBeCloseTo(1.3)
        expect(box.center.z).toBeCloseTo(0.9)
    })

    it('身前目标命中，超出检测箱前缘未命中', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0, y: 0, z: 1.0}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0, y: 0, z: 1.4}, 1, 0)).toBe(false)
    })

    it('身后覆盖由 offset - size/2 决定（少量贴背余量）', () => {
        /* 后缘 = 0.45 - 0.65 = -0.2 */
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0, y: 0, z: -0.15}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0, y: 0, z: -0.4}, 1, 0)).toBe(false)
    })

    it('侧面覆盖由 size.x 决定', () => {
        /* 侧向半宽 0.225 + 目标半宽 0.125 → x=0.3 命中，x=0.4 未命中 */
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0.3, y: 0, z: 0}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0.4, y: 0, z: 0}, 1, 0)).toBe(false)
    })

    it('深度随武器 detectBox 变化（长枪显著远于短刃）', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, spearDetectBox, 1, 0, {x: 0, y: 0, z: 1.8}, 1, 0)).toBe(true)
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, 0, {x: 0, y: 0, z: 1.8}, 1, 0)).toBe(false)
    })

    it('检测箱随角色朝向旋转：转 90° 后前方由 +Z 变为 +X', () => {
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, Math.PI / 2, {x: 1.0, y: 0, z: 0}, 1, 0)).toBe(true)
        /* 原 +Z 方向变为侧方，超出侧向半宽 */
        expect(testAttackDetect({x: 0, y: 0, z: 0}, swordDetectBox, 1, Math.PI / 2, {x: 0, y: 0, z: 1.0}, 1, 0)).toBe(false)
    })
})

describe('命中窗口（setHitWindow 事件轨道驱动）', () => {
    const makeSkill = (): SkillConfig => {
        const slot = buildMeleeSkillSlots('short_sword')[0]
        if (slot.config.type !== 'melee') throw new Error('测试需要近战技能配置')
        return slot.config
    }
    const makeEntity = (): CharacterEntity => ({
        id: 1,
        config: {speed: 6, jumpHeight: 2, scale: 1},
        mesh: null!,
        wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body: {translation: () => ({x: 0, y: 0, z: 0})} as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '',
        navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
        isDying: false, dyingTimer: 0,
        combat: {skills: [makeSkill()], currentSkillIndex: 0} as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    })

    it('窗口关闭时 update 早退（getModel 不被调用）', () => {
        const getModel = vi.fn()
        const executor = createMeleeExecutor(() => [], getModel, () => 0)
        const skill = makeSkill()
        executor.update(0.016, skill, makeEntity().combat, makeEntity(), {} as ExecutorContext)
        expect(getModel).not.toHaveBeenCalled()
        executor.setHitWindow(true)
        executor.update(0.016, skill, makeEntity().combat, makeEntity(), {} as ExecutorContext)
        expect(getModel).toHaveBeenCalled()
        executor.setHitWindow(false)
        getModel.mockClear()
        executor.update(0.016, skill, makeEntity().combat, makeEntity(), {} as ExecutorContext)
        expect(getModel).not.toHaveBeenCalled()
    })

    it('非近战技能早退（ranged 不受窗口影响）', () => {
        const getModel = vi.fn()
        const executor = createMeleeExecutor(() => [], getModel, () => 0)
        executor.setHitWindow(true)
        executor.update(0.016, {type: 'ranged'} as SkillConfig, makeEntity().combat, makeEntity(), {} as ExecutorContext)
        expect(getModel).not.toHaveBeenCalled()
    })
})
