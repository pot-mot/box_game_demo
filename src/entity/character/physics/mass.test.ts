import {describe, it, expect, beforeAll} from 'vitest'
import {createHarnessWorld, makeChar, makeDynamicBox, initRapier} from './harness.ts'

/**
 * 刚体质量回归测试：
 * cannon-es 时代角色 mass=1、箱子 mass=config.mass；Rapier 迁移后若漏设质量，
 * 动态刚体按「密度 1 × 碰撞体体积」计算（角色 ≈0.04），击退冲量（Δv = J/m）会被放大 ~25 倍。
 */
describe('刚体质量与击退（回归保护）', () => {
    beforeAll(async () => {
        await initRapier()
    })

    it('角色刚体质量恒为 1（对齐 cannon-es master）', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, 0)
        expect(ch.body.mass()).toBeCloseTo(1, 6)
    })

    it('击退冲量 Δv = 冲量 ÷ 质量（长刀 knockbackForce 5 / knockbackY 2）', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, 0)
        /* 与 melee_executor 相同的施加方式：世界空间冲量作用于质心 */
        ch.body.applyImpulseAtPoint({x: 5, y: 2, z: 0}, ch.body.translation(), true)
        const v = ch.body.linvel()
        expect(v.x).toBeCloseTo(5, 3)
        expect(v.y).toBeCloseTo(2, 3)
        expect(v.z).toBeCloseTo(0, 3)
    })

    it('动态箱子质量 = 构造参数（config.mass 参与物理）', () => {
        const hw = createHarnessWorld()
        const box = makeDynamicBox(hw, 0, 0.5, 0, 0.5, 0.5, 0.5, 5)
        expect(box.mass()).toBeCloseTo(5, 6)
    })

    it('箱子尺寸不影响质量（密度 0，质量与体积解耦）', () => {
        const hw = createHarnessWorld()
        const small = makeDynamicBox(hw, 0, 0.5, 0, 0.25, 0.25, 0.25, 5)
        const large = makeDynamicBox(hw, 2, 0.5, 0, 1, 1, 1, 5)
        expect(small.mass()).toBeCloseTo(5, 6)
        expect(large.mass()).toBeCloseTo(5, 6)
    })
})
