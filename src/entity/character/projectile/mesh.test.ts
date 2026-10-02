import {describe, it, expect} from 'vitest'
import {Scene} from 'three'
import {RANGED_WEAPON_PRESETS} from '../../../character/weapon/ranged_weapon.ts'
import {
    buildProjectileVisual, createProjectileVisualPool, projectileColorOf, projectileVisualSignature,
} from './mesh.ts'

const arrowSpec = RANGED_WEAPON_PRESETS.longbow.projectile
const boltSpec = RANGED_WEAPON_PRESETS.crossbow.projectile
const bulletSpec = RANGED_WEAPON_PRESETS.shotgun.projectile
const staffSpec = RANGED_WEAPON_PRESETS.staff.projectile
const axeSpec = RANGED_WEAPON_PRESETS.throwing_axe.projectile

describe('弹丸视觉构建器（独立 build 模块）', () => {
    it('每种视觉 kind 都能构建出含子节点的 Group', () => {
        const longbow = buildProjectileVisual(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh)
        const crossbow = buildProjectileVisual(boltSpec, RANGED_WEAPON_PRESETS.crossbow.mesh)
        const shotgun = buildProjectileVisual(bulletSpec, RANGED_WEAPON_PRESETS.shotgun.mesh)
        const staff = buildProjectileVisual(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh)
        const axe = buildProjectileVisual(axeSpec, RANGED_WEAPON_PRESETS.throwing_axe.mesh)
        for (const visual of [longbow, crossbow, shotgun, staff, axe]) {
            expect(visual.group.children.length).toBeGreaterThan(0)
        }
    })

    it('朝向驱动：箭矢 / 弩矢沿速度，投掷物随物理旋转，魔法球 / 弹头不动', () => {
        expect(buildProjectileVisual(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh).orientation).toBe('velocity')
        expect(buildProjectileVisual(axeSpec, RANGED_WEAPON_PRESETS.throwing_axe.mesh).orientation).toBe('physics')
        expect(buildProjectileVisual(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh).orientation).toBe('none')
        expect(buildProjectileVisual(bulletSpec, RANGED_WEAPON_PRESETS.shotgun.mesh).orientation).toBe('none')
    })

    it('魔法球带轨迹网格与脉冲动画，颜色取自武器模型', () => {
        const staff = buildProjectileVisual(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh)
        expect(staff.trailMesh).toBeDefined()
        expect(staff.trail).toBeDefined()
        expect(staff.animate).toBeDefined()
        /* 法杖 orbColor = 0x44aaff */
        expect(projectileColorOf(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh)).toBe(0x44aaff)
    })

    it('非魔法弹体没有轨迹', () => {
        expect(buildProjectileVisual(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh).trailMesh).toBeUndefined()
    })

    it('视觉签名：魔法球按颜色、物理弹体按 kind、投掷物按完整 mesh 参数', () => {
        expect(projectileVisualSignature(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh)).toBe('arrow')
        expect(projectileVisualSignature(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh)).toBe(`orb:${0x44aaff}`)

        const axeMesh = RANGED_WEAPON_PRESETS.throwing_axe.mesh
        if (axeMesh.id !== 'throwing_axe') throw new Error('throwing_axe 预设应为投掷斧模型')
        /* 同 id、同参数 → 同签名（共享池） */
        expect(projectileVisualSignature(axeSpec, {...axeMesh})).toBe(projectileVisualSignature(axeSpec, axeMesh))
        /* 同 id、不同参数 → 不同签名（避免复用错误几何） */
        expect(projectileVisualSignature(axeSpec, {...axeMesh, bladeSize: axeMesh.bladeSize + 0.1}))
            .not.toBe(projectileVisualSignature(axeSpec, axeMesh))
    })
})

describe('弹丸视觉池', () => {
    it('release 后摘除场景节点，再次 acquire 复用同一实例', () => {
        const scene = new Scene()
        const pool = createProjectileVisualPool(scene)
        const v1 = pool.acquire(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh)
        expect(pool.activeCount()).toBe(1)
        expect(scene.children).toContain(v1.group)

        pool.release(v1)
        expect(pool.activeCount()).toBe(0)
        expect(pool.pooledCount()).toBe(1)
        expect(scene.children).not.toContain(v1.group)

        const v2 = pool.acquire(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh)
        expect(v2).toBe(v1)
        pool.dispose()
    })

    it('魔法球的轨迹网格随实例挂载 / 摘除', () => {
        const scene = new Scene()
        const pool = createProjectileVisualPool(scene)
        const orb = pool.acquire(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh)
        expect(orb.trailMesh).toBeDefined()
        expect(scene.children).toContain(orb.trailMesh)
        pool.release(orb)
        expect(scene.children).not.toContain(orb.trailMesh)
        pool.dispose()
    })

    it('dispose 释放借出中的实例并摘除场景节点', () => {
        const scene = new Scene()
        const pool = createProjectileVisualPool(scene)
        pool.acquire(staffSpec, RANGED_WEAPON_PRESETS.staff.mesh)
        pool.acquire(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh)
        expect(pool.activeCount()).toBe(2)
        expect(scene.children.length).toBeGreaterThan(0)

        pool.dispose()
        expect(pool.activeCount()).toBe(0)
        expect(scene.children).toHaveLength(0)
    })

    it('不同签名分桶，互不复用', () => {
        const scene = new Scene()
        const pool = createProjectileVisualPool(scene)
        const arrow = pool.acquire(arrowSpec, RANGED_WEAPON_PRESETS.longbow.mesh)
        const axe = pool.acquire(axeSpec, RANGED_WEAPON_PRESETS.throwing_axe.mesh)
        expect(axe).not.toBe(arrow)
        expect(pool.activeCount()).toBe(2)
        pool.release(arrow)
        pool.release(axe)
        expect(pool.pooledCount()).toBe(2)
        pool.dispose()
    })
})
