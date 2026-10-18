import {describe, it, expect} from 'vitest'
import {DEFAULT_PROJECTILE_GRAVITY_SCALE, type RangedWeaponConfig} from './ranged_weapon.ts'
import {allWeaponPresets, findWeaponPreset} from './catalog.ts'

/* 全部已注册远程武器（含各体形） */
const RANGED_WEAPON_PRESETS: Record<string, RangedWeaponConfig> = Object.fromEntries(
    allWeaponPresets()
        .filter((w): w is RangedWeaponConfig => w.type === 'ranged')
        .map(w => [w.id, w]),
)
const presets = Object.entries(RANGED_WEAPON_PRESETS) as [string, RangedWeaponConfig][]
const presetIds = presets.map(([key]) => key)

describe('RANGED_WEAPON_PRESETS 关系不变量', () => {
    it.each(presetIds)('%s 的 idealRange 在 retreatRange 和 range 之间', (key) => {
        const w = RANGED_WEAPON_PRESETS[key]
        expect(w.idealRange).toBeGreaterThan(w.retreatRange)
        expect(w.idealRange).toBeLessThan(w.range)
    })

    it.each(presetIds)('%s 的 detectionRange >= range', (key) => {
        const w = RANGED_WEAPON_PRESETS[key]
        expect(w.detectionRange).toBeGreaterThanOrEqual(w.range)
    })

    it('远程侦测范围大于近战', () => {
        const meleeDet = findWeaponPreset('long_sword')?.detectionRange ?? 0
        for (const [, w] of presets) {
            expect(w.detectionRange).toBeGreaterThanOrEqual(meleeDet)
        }
    })
})

describe('弹丸视觉规格（视觉分发依据）', () => {
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
})

describe('弹丸重力缩放（projectileGravityScale）', () => {
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
        for (const id of ['throwing_axe', 'grenade', 'molotov'] as const) {
            expect(RANGED_WEAPON_PRESETS[id].throwAngle ?? 0).toBeGreaterThan(0)
        }
    })
})
