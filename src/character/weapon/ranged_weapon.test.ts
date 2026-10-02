import {describe, it, expect} from 'vitest'
import {DEFAULT_BULLET_PASS_THROUGH_CATEGORIES, DEFAULT_PROJECTILE_GRAVITY_SCALE, RANGED_WEAPON_PRESETS, type RangedWeaponConfig} from './ranged_weapon.ts'
import {MELEE_WEAPON_PRESETS} from './melee_weapon.ts'

const presets = Object.entries(RANGED_WEAPON_PRESETS) as [string, RangedWeaponConfig][]
const presetIds = presets.map(([key]) => key)

describe('RANGED_WEAPON_PRESETS', () => {
    it('包含 9 种武器', () => {
        expect(presets).toHaveLength(9)
    })

    it.each(presetIds)('%s 的 id 与 key 匹配', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].id).toBe(key)
    })

    it.each(presetIds)('%s 的 type 为 ranged', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].type).toBe('ranged')
    })

    it.each(presetIds)('%s 的 damage > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].damage).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 range > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].range).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 projectileSpeed > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].projectileSpeed).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 projectileLifetime > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].projectileLifetime).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 idealRange 在 retreatRange 和 range 之间', (key) => {
        const w = RANGED_WEAPON_PRESETS[key]
        expect(w.idealRange).toBeGreaterThan(w.retreatRange)
        expect(w.idealRange).toBeLessThan(w.range)
    })

    it.each(presetIds)('%s 的 detectionRange >= range', (key) => {
        const w = RANGED_WEAPON_PRESETS[key]
        expect(w.detectionRange).toBeGreaterThanOrEqual(w.range)
    })

    it.each(presetIds)('%s 的 knockbackForce > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].knockbackForce).toBeGreaterThan(0)
    })

    it('法杖与魔杖为魔法武器，其余远程为物理', () => {
        expect(RANGED_WEAPON_PRESETS.staff.damageType).toBe('magic')
        expect(RANGED_WEAPON_PRESETS.magic_wand.damageType).toBe('magic')
        for (const [, w] of presets) {
            if (w.id === 'staff' || w.id === 'magic_wand') continue
            expect(w.damageType).toBe('physical')
        }
    })

    it('shotgun 有 spreadCount=6 且 spreadAngle>0', () => {
        const s = RANGED_WEAPON_PRESETS.shotgun
        expect(s.spreadCount).toBe(6)
        expect(s.spreadAngle).toBeGreaterThan(0)
    })

    it('staff 有 explosionRadius>0', () => {
        expect(RANGED_WEAPON_PRESETS.staff.explosionRadius).toBeGreaterThan(0)
    })

    it('magic_wand 有 homingStrength>0', () => {
        expect(RANGED_WEAPON_PRESETS.magic_wand.homingStrength).toBeGreaterThan(0)
    })

    it('grenade 有 throwAngle>0 和 explosionRadius>0', () => {
        const g = RANGED_WEAPON_PRESETS.grenade
        expect(g.throwAngle).toBeGreaterThan(0)
        expect(g.explosionRadius).toBeGreaterThan(0)
    })

    it('远程侦测范围大于近战', () => {
        const meleeDet = MELEE_WEAPON_PRESETS.long_sword.detectionRange
        for (const [, w] of presets) {
            expect(w.detectionRange).toBeGreaterThanOrEqual(meleeDet)
        }
    })

    it('crossbow 弹速最快', () => {
        const cb = RANGED_WEAPON_PRESETS.crossbow.projectileSpeed
        for (const [, w] of presets) {
            expect(w.projectileSpeed).toBeLessThanOrEqual(cb)
        }
    })

    it.each(presetIds)('%s 的中文名非空且为中文', (key) => {
        const name = RANGED_WEAPON_PRESETS[key].name
        expect(name.length).toBeGreaterThan(0)
        expect(name).toMatch(/^[\u4e00-\u9fa5]+$/)
    })

    it.each(presetIds)('%s 的中文名与 id 不同（面向玩家可读）', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].name).not.toBe(key)
    })

    it('中文名互不重复', () => {
        const names = presets.map(([, w]) => w.name)
        expect(new Set(names).size).toBe(names.length)
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, w]) => w.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

describe('子弹可穿过类别（DEFAULT_BULLET_PASS_THROUGH_CATEGORIES）', () => {
    it('默认仅可穿过 area', () => {
        expect(DEFAULT_BULLET_PASS_THROUGH_CATEGORIES).toEqual(['area'])
    })

    it.each(presetIds)('%s 未覆写该字段 → 沿用默认（仅 area）', (key) => {
        const configured = RANGED_WEAPON_PRESETS[key].passThroughCategories
            ?? DEFAULT_BULLET_PASS_THROUGH_CATEGORIES
        expect(configured).toEqual(['area'])
    })
})

describe('弹丸视觉与重力（projectile / projectileGravityScale）', () => {
    it.each(presetIds)('%s 声明了弹丸视觉规格', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].projectile.kind).toBeDefined()
    })

    it('弓 / 弩 / 枪使用箭矢 / 弩矢 / 弹头', () => {
        expect(RANGED_WEAPON_PRESETS.longbow.projectile.kind).toBe('arrow')
        expect(RANGED_WEAPON_PRESETS.crossbow.projectile.kind).toBe('bolt')
        expect(RANGED_WEAPON_PRESETS.shotgun.projectile.kind).toBe('bullet')
    })

    it('法杖 / 魔杖使用魔法球', () => {
        expect(RANGED_WEAPON_PRESETS.staff.projectile.kind).toBe('magic_orb')
        expect(RANGED_WEAPON_PRESETS.magic_wand.projectile.kind).toBe('magic_orb')
    })

    it('飞斧 / 飞镖 / 手雷 / 燃烧瓶复用武器模型', () => {
        for (const id of ['throwing_axe', 'throwing_dart', 'grenade', 'molotov']) {
            expect(RANGED_WEAPON_PRESETS[id].projectile.kind).toBe('thrown_weapon')
        }
    })

    it('范围伤害武器声明了爆炸特效风格', () => {
        expect(RANGED_WEAPON_PRESETS.staff.projectile.explosionStyle).toBe('magic')
        expect(RANGED_WEAPON_PRESETS.grenade.projectile.explosionStyle).toBe('frag')
        expect(RANGED_WEAPON_PRESETS.molotov.projectile.explosionStyle).toBe('fire')
    })

    it.each(presetIds)('%s 的重力缩放（声明值或运行时缺省）∈ [0, 1)', (key) => {
        /* 字段可选：未声明时由弹丸系统回退到 DEFAULT_PROJECTILE_GRAVITY_SCALE，
         * 因此这里断言有效值，避免把可选字段当必填 */
        const g = RANGED_WEAPON_PRESETS[key].projectileGravityScale ?? DEFAULT_PROJECTILE_GRAVITY_SCALE
        expect(g).toBeGreaterThanOrEqual(0)
        expect(g).toBeLessThan(1)
    })

    it('直线弹（弓 / 弩 / 枪 / 魔法）重力远小于投掷物', () => {
        const scaleOf = (id: string): number =>
            RANGED_WEAPON_PRESETS[id].projectileGravityScale ?? DEFAULT_PROJECTILE_GRAVITY_SCALE
        const straight = ['longbow', 'crossbow', 'shotgun', 'staff', 'magic_wand'] as const
        const thrown = ['throwing_axe', 'grenade', 'molotov'] as const
        for (const id of straight) {
            expect(scaleOf(id)).toBeLessThan(0.1)
        }
        for (const id of thrown) {
            expect(scaleOf(id)).toBeGreaterThan(0.3)
        }
    })

    it('投掷类武器（飞斧 / 手雷 / 燃烧瓶）有可见抛物线仰角', () => {
        /* 投掷物以物理实体抛出，仰角决定抛物线手感；燃烧瓶新增仰角后需有回归覆盖 */
        for (const id of ['throwing_axe', 'grenade', 'molotov'] as const) {
            expect(RANGED_WEAPON_PRESETS[id].throwAngle ?? 0).toBeGreaterThan(0)
        }
    })
})
