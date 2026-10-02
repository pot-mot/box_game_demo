import {describe, it, expect} from 'vitest'
import {
    allOf,
    always,
    anyOf,
    cooldownReady,
    findSegment,
    chainOf,
    hasMoveInput,
    holdAtLeast,
    holdLessThan,
    isChargeableKey,
    noMoveInput,
    not,
    orderedSegments,
    pressedKey,
    pressedOtherKey,
    resolveEntrySegment,
    resolveNextSegment,
    segmentDisplayName,
    segmentTotalDuration,
    type AttackTransitionContext,
} from './attack_chain.ts'
import type {AttackSegment, WeaponAttacks} from './attack_chain.ts'
import {ALL_WEAPON_PRESETS, defaultHoldMode, findWeaponPreset, weaponAttacksOf, weaponPresetOrDefault} from './catalog.ts'
import {MELEE_WEAPON_CLASSES, MELEE_WEAPON_PRESETS} from './melee_weapon.ts'
import {buildMeleeAttacks} from './melee_attacks.ts'
import {RANGED_WEAPON_PRESETS} from './ranged_weapon.ts'
import {createWeaponRuntime} from './weapon_runtime.ts'
import {
    TEST_WEAPON_CHARGE_HOLD,
    createTestWeaponRuntime,
    TEST_WEAPON_ID,
} from '../combat/test_weapon.ts'

const MELEE_WEAPON_IDS = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer']
const RANGED_WEAPON_IDS = ['longbow', 'crossbow', 'shotgun', 'staff', 'magic_wand', 'throwing_axe', 'grenade', 'molotov', 'throwing_dart']

/** 段转换上下文（默认：无攻击输入、无冷却） */
const ctxOf = (overrides: Partial<AttackTransitionContext> = {}): AttackTransitionContext => ({
    dx: 0,
    dz: 0,
    holdDuration: 0,
    attackKey: undefined,
    cooldownRemaining: () => 0,
    ...overrides,
})

const segmentIdOf = (weaponId: string, holdMode: string, suffix: string): string => `${weaponId}_${holdMode}_${suffix}`

/** 默认持握模式（全部近战 = 单持）的主干段编排 */
const MELEE_CHAIN_STEPS: Readonly<Record<string, {light: readonly string[]; heavy: readonly string[]}>> = {
    short_sword: {light: ['light_1', 'light_2'], heavy: ['heavy_1', 'heavy_2']},
    long_sword: {light: ['light_1', 'light_2'], heavy: ['heavy_1', 'heavy_2']},
    heavy_sword: {light: ['light_1', 'light_2'], heavy: ['heavy_1', 'heavy_2']},
    spear: {light: ['light_1', 'light_2'], heavy: ['heavy_1', 'heavy_2']},
    dual_axe: {light: ['light_1', 'light_2'], heavy: ['heavy_1', 'heavy_2']},
    war_hammer: {light: ['light_1', 'light_2'], heavy: ['heavy_1', 'heavy_2']},
}

describe('近战武器攻击链（武器类固有数据，默认单持）', () => {
    it.each(MELEE_WEAPON_IDS)('%s：默认模式主干段与链编排一致', (weaponId) => {
        const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS[weaponId])
        const mode = defaultHoldMode(MELEE_WEAPON_PRESETS[weaponId])
        const expected = MELEE_CHAIN_STEPS[weaponId]
        const stepIds = new Set([...expected.light, ...expected.heavy].map(step => segmentIdOf(weaponId, mode, step)))
        const allIds = Object.keys(attacks.segments)
        /* 主干段恰好是编排里的那些段；追加的条件变体段不属于主干 */
        expect(allIds.filter(id => stepIds.has(id)).sort()).toEqual([...stepIds].sort())
        expect(allIds.length).toBeGreaterThanOrEqual(stepIds.size)
        expect(chainOf(attacks, 'light').steps).toEqual(expected.light.map(step => segmentIdOf(weaponId, mode, step)))
        expect(chainOf(attacks, 'heavy').steps).toEqual(expected.heavy.map(step => segmentIdOf(weaponId, mode, step)))
    })

    it.each(MELEE_WEAPON_IDS)('%s：轻重键起手候选分别为 轻 1 / 重 1（蓄力由段内 chargeFullTime 表达，不再用起手变体）', (weaponId) => {
        const weapon = MELEE_WEAPON_PRESETS[weaponId]
        const mode = defaultHoldMode(weapon)
        const attacks = weaponAttacksOf(weapon)
        expect(chainOf(attacks, 'light').entries).toEqual([{segmentId: segmentIdOf(weaponId, mode, 'light_1')}])
        expect(chainOf(attacks, 'heavy').entries).toEqual([{segmentId: segmentIdOf(weaponId, mode, 'heavy_1')}])
    })

    it.each(MELEE_WEAPON_IDS)('%s：同链依编排推进（末段回到首段 = 循环链）', (weaponId) => {
        const weapon = MELEE_WEAPON_PRESETS[weaponId]
        const mode = defaultHoldMode(weapon)
        const attacks = weaponAttacksOf(weapon)
        const expected = MELEE_CHAIN_STEPS[weaponId]
        for (const key of ['light', 'heavy'] as const) {
            const steps = expected[key].map(step => segmentIdOf(weaponId, mode, step))
            for (let i = 0; i < steps.length; i++) {
                const segment = findSegment(attacks, steps[i])!
                const nextId = steps[(i + 1) % steps.length]
                expect(resolveNextSegment(attacks, segment, ctxOf({attackKey: key}))?.id).toBe(nextId)
            }
        }
    })

    it.each(MELEE_WEAPON_IDS)('%s：主干段时长/伤害倍率（轻 0.267+0.266、重 0.4+0.267 ×1.6）', (weaponId) => {
        const weapon = MELEE_WEAPON_PRESETS[weaponId]
        const mode = defaultHoldMode(weapon)
        const attacks = weaponAttacksOf(weapon)
        const expected = MELEE_CHAIN_STEPS[weaponId]
        const stepIds = new Set([...expected.light, ...expected.heavy].map(step => segmentIdOf(weaponId, mode, step)))
        for (const segment of Object.values(attacks.segments)) {
            if (!stepIds.has(segment.id)) continue
            if (segment.key === 'light') {
                expect(segmentTotalDuration(segment), segment.id).toBeCloseTo(0.533, 6)
                expect(segment.damageMultiplier, segment.id).toBe(1)
            } else {
                expect(segmentTotalDuration(segment), segment.id).toBeCloseTo(0.667, 6)
                expect(segment.damageMultiplier, segment.id).toBeCloseTo(1.6, 6)
            }
        }
    })

    it('巨剑双手链为三段：轻 1 → 轻 2 → 轻 3 → 轻 1', () => {
        const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS.heavy_sword, 'two_handed')
        expect(chainOf(attacks, 'light').steps).toEqual([
            'heavy_sword_two_handed_light_1', 'heavy_sword_two_handed_light_2', 'heavy_sword_two_handed_light_3',
        ])
        expect(orderedSegments(attacks).map(segment => segment.id)).toEqual([
            'heavy_sword_two_handed_light_1', 'heavy_sword_two_handed_light_2', 'heavy_sword_two_handed_light_3',
            'heavy_sword_two_handed_heavy_1', 'heavy_sword_two_handed_heavy_2',
        ])
        expect(segmentDisplayName(findSegment(attacks, 'heavy_sword_two_handed_light_3')!)).toBe('轻击三段')
    })

    it('通用重击蓄力：所有近战武器每种模式的重击段均可蓄力（时长/姿势/伤害加成/冷却），轻击段不可', () => {
        for (const weaponId of MELEE_WEAPON_IDS) {
            for (const mode of MELEE_WEAPON_CLASSES[weaponId].holdModes) {
                const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS[weaponId], mode)
                const heavy1 = findSegment(attacks, `${weaponId}_${mode}_heavy_1`)!
                expect(heavy1.chargeFullTime, `${weaponId}/${mode}`).toBe(1)
                expect(heavy1.chargeDamageBonus).toBe(1)
                expect(heavy1.chargeCooldown).toBeGreaterThan(0)
                expect(heavy1.chargePoseId).toBe(`charge_melee_${mode}`)
                /* 重击 strike 阶段为蓄力锚点（按住冻结在起手帧） */
                expect(heavy1.phases.some(phase => phase.chargeable === true)).toBe(true)
                /* 轻击段不可蓄力 */
                expect(findSegment(attacks, `${weaponId}_${mode}_light_1`)!.chargeFullTime).toBeUndefined()
                expect(isChargeableKey(attacks, 'heavy')).toBe(true)
                expect(isChargeableKey(attacks, 'light')).toBe(false)
            }
        }
    })

    it('全部近战武器类：三种持握模式各自声明独立连段（段 id 带模式命名空间）', () => {
        for (const weaponId of MELEE_WEAPON_IDS) {
            const weaponClass = MELEE_WEAPON_CLASSES[weaponId]
            expect(weaponClass.holdModes, weaponId).toEqual(['one_handed', 'two_handed', 'dual_wield'])
            for (const mode of weaponClass.holdModes) {
                const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS[weaponId], mode)
                const segments = orderedSegments(attacks)
                expect(segments.length, `${weaponId}/${mode}`).toBeGreaterThanOrEqual(4)
                for (const segment of segments) {
                    expect(segment.id, `${weaponId}/${mode}`).toContain(`_${mode}_`)
                }
            }
            /* 三模式链互不相同（独立连段数据） */
            const lightSteps = new Set(weaponClass.holdModes.map(mode => weaponAttacksOf(MELEE_WEAPON_PRESETS[weaponId], mode).chains.light.steps.join(',')))
            expect(lightSteps.size, weaponId).toBe(3)
        }
    })

    it('主干段冷却全为 0（节奏由动作 + 恢复时间形成；条件变体段可自带冷却）', () => {
        for (const weaponId of MELEE_WEAPON_IDS) {
            for (const mode of MELEE_WEAPON_CLASSES[weaponId].holdModes) {
                const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS[weaponId], mode)
                const stepIds = new Set([...chainOf(attacks, 'light').steps, ...chainOf(attacks, 'heavy').steps])
                for (const segment of Object.values(attacks.segments)) {
                    if (!stepIds.has(segment.id)) continue
                    expect(segment.cooldown, segment.id).toBe(0)
                }
            }
        }
    })
})

describe('远程武器攻击链（单段开火动作）', () => {
    it.each(RANGED_WEAPON_IDS)('%s：单段、轻键起手、无连段', (weaponId) => {
        const attacks = weaponAttacksOf(RANGED_WEAPON_PRESETS[weaponId])
        const segments = orderedSegments(attacks)
        expect(segments).toHaveLength(1)
        expect(segments[0].key).toBe('light')
        expect(segments[0].next).toEqual([])
        expect(chainOf(attacks, 'light').entries).toEqual([{segmentId: segments[0].id}])
        /* 远程无重击链 */
        expect(chainOf(attacks, 'heavy').entries).toEqual([])
        expect(chainOf(attacks, 'heavy').steps).toEqual([])
    })

    it('段 id 沿用原远程技能 id（动画键稳定）', () => {
        expect(orderedSegments(weaponAttacksOf(RANGED_WEAPON_PRESETS.longbow))[0].id).toBe('longbow_shot')
        expect(orderedSegments(weaponAttacksOf(RANGED_WEAPON_PRESETS.throwing_dart))[0].id).toBe('throwing_dart_fling')
    })

    it.each(RANGED_WEAPON_IDS)('%s：重击键起手解析恒失败（无重击链）', (weaponId) => {
        const attacks = weaponAttacksOf(RANGED_WEAPON_PRESETS[weaponId])
        expect(resolveEntrySegment(attacks, 'heavy', ctxOf())).toBeUndefined()
        /* 轻击键仍可正常起手 */
        expect(resolveEntrySegment(attacks, 'light', ctxOf())?.id).toBe(orderedSegments(attacks)[0].id)
    })
})

describe('段清单顺序（orderedSegments）', () => {
    it('每把近战武器默认链：轻击键段整体在重击键段之前，且每键内先主干段（按编排顺序）后变体段', () => {
        for (const weaponId of MELEE_WEAPON_IDS) {
            const weapon = MELEE_WEAPON_PRESETS[weaponId]
            const mode = defaultHoldMode(weapon)
            const attacks = weaponAttacksOf(weapon)
            const ordered = orderedSegments(attacks)
            const lightSegments = ordered.filter(segment => segment.key === 'light')
            const heavySegments = ordered.filter(segment => segment.key === 'heavy')
            /* 轻链整体位于重链之前 */
            expect(ordered.map(segment => segment.id)).toEqual([
                ...lightSegments.map(segment => segment.id),
                ...heavySegments.map(segment => segment.id),
            ])
            /* 每键内：主干段按编排顺序连续排在前面，变体段接在其后 */
            const expected = MELEE_CHAIN_STEPS[weaponId]
            expect(lightSegments.slice(0, expected.light.length).map(segment => segment.id))
                .toEqual(expected.light.map(step => segmentIdOf(weaponId, mode, step)))
            expect(heavySegments.slice(0, expected.heavy.length).map(segment => segment.id))
                .toEqual(expected.heavy.map(step => segmentIdOf(weaponId, mode, step)))
            for (const variant of [...lightSegments.slice(expected.light.length), ...heavySegments.slice(expected.heavy.length)]) {
                expect(expected.light.includes(variant.id.replace(`${weaponId}_${mode}_`, ''))).toBe(false)
            }
        }
    })

    it('条件起手变体段接在所属攻击键主干段之后', () => {
        const attacks = createTestWeaponRuntime().attacks
        expect(orderedSegments(attacks).map(segment => segment.id)).toEqual([
            'test_weapon_tap',
            'test_weapon_light_2',
            'test_weapon_charge',
            'test_weapon_thrust',
            'test_weapon_heavy_1',
            'test_weapon_heavy_2',
        ])
    })

    it('全部生产武器的段顺序中，轻链整体位于重链之前', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            for (const mode of weapon.holdModes) {
                const segments = orderedSegments(weaponAttacksOf(weapon, mode))
                const lastLight = segments.map(segment => segment.key).lastIndexOf('light')
                const firstHeavy = segments.map(segment => segment.key).indexOf('heavy')
                if (firstHeavy === -1) continue
                expect(lastLight).toBeLessThan(firstHeavy)
            }
        }
    })
})

describe('起手解析（resolveEntrySegment）', () => {
    it('无条件候选：直接返回起手段', () => {
        const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS.short_sword)
        expect(resolveEntrySegment(attacks, 'light', ctxOf())?.id).toBe('short_sword_one_handed_light_1')
        expect(resolveEntrySegment(attacks, 'heavy', ctxOf())?.id).toBe('short_sword_one_handed_heavy_1')
    })

    it('冷却未就绪 → 无候选（undefined）', () => {
        const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS.short_sword)
        const ctx = ctxOf({cooldownRemaining: (id) => id === 'short_sword_one_handed_light_1' ? 0.5 : 0})
        expect(resolveEntrySegment(attacks, 'light', ctx)).toBeUndefined()
    })

    it('不切到自身（攻击中重复按同键不应重启本段）', () => {
        const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS.short_sword)
        expect(resolveEntrySegment(attacks, 'light', ctxOf(), 'short_sword_one_handed_light_1')).toBeUndefined()
    })

    it('守卫变体优先于同键兜底（长按触发蓄力段）', () => {
        const attacks = createTestWeaponRuntime().attacks
        expect(resolveEntrySegment(attacks, 'light', ctxOf({holdDuration: TEST_WEAPON_CHARGE_HOLD}))?.id).toBe('test_weapon_charge')
        expect(resolveEntrySegment(attacks, 'light', ctxOf({holdDuration: TEST_WEAPON_CHARGE_HOLD - 0.01}))?.id).toBe('test_weapon_tap')
    })

    it('守卫变体冷却中时回退到兜底候选（冷却相互独立）', () => {
        const attacks = createTestWeaponRuntime().attacks
        const ctx = ctxOf({
            holdDuration: TEST_WEAPON_CHARGE_HOLD,
            cooldownRemaining: (id) => id === 'test_weapon_charge' ? 1 : 0,
        })
        expect(resolveEntrySegment(attacks, 'light', ctx)?.id).toBe('test_weapon_tap')
    })
})

describe('段转换（resolveNextSegment）', () => {
    it('方向组合键变体优先于兜底段（有移动输入 → 突刺）', () => {
        const attacks = createTestWeaponRuntime().attacks
        const tap = findSegment(attacks, 'test_weapon_tap')!
        expect(resolveNextSegment(attacks, tap, ctxOf({dx: 1}))?.id).toBe('test_weapon_thrust')
        expect(resolveNextSegment(attacks, tap, ctxOf())?.id).toBe('test_weapon_light_2')
    })

    it('链终止段无下一状态（单发蓄力段）', () => {
        const attacks = createTestWeaponRuntime().attacks
        const charge = findSegment(attacks, 'test_weapon_charge')!
        expect(resolveNextSegment(attacks, charge, ctxOf({attackKey: 'light'}))).toBeUndefined()
    })

    it('远程单段武器无下一状态', () => {
        const attacks = weaponAttacksOf(RANGED_WEAPON_PRESETS.longbow)
        const shot = orderedSegments(attacks)[0]
        expect(resolveNextSegment(attacks, shot, ctxOf({attackKey: 'light'}))).toBeUndefined()
    })
})

describe('守卫原语（武器模组组合使用）', () => {
    const ctx = ctxOf({dx: 1, dz: 0, holdDuration: 0.4, attackKey: 'light'})

    it('always / not', () => {
        expect(always(ctx)).toBe(true)
        expect(not(always)(ctx)).toBe(false)
    })

    it('pressedKey / pressedOtherKey', () => {
        expect(pressedKey('light')(ctx)).toBe(true)
        expect(pressedKey('heavy')(ctx)).toBe(false)
        expect(pressedOtherKey('light')(ctx)).toBe(false)
        expect(pressedOtherKey('heavy')(ctx)).toBe(true)
        /* 未按任何攻击键时：pressedOtherKey 恒 false（避免无输入被当成切链） */
        expect(pressedOtherKey('heavy')(ctxOf())).toBe(false)
    })

    it('holdAtLeast / holdLessThan', () => {
        expect(holdAtLeast(0.4)(ctx)).toBe(true)
        expect(holdAtLeast(0.5)(ctx)).toBe(false)
        expect(holdLessThan(0.5)(ctx)).toBe(true)
        expect(holdLessThan(0.4)(ctx)).toBe(false)
    })

    it('hasMoveInput / noMoveInput', () => {
        expect(hasMoveInput(ctx)).toBe(true)
        expect(noMoveInput(ctx)).toBe(false)
        expect(hasMoveInput(ctxOf())).toBe(false)
        expect(noMoveInput(ctxOf())).toBe(true)
    })

    it('cooldownReady 读取上下文冷却查询', () => {
        const busy = ctxOf({cooldownRemaining: (id) => id === 'seg' ? 0.2 : 0})
        expect(cooldownReady('seg')(busy)).toBe(false)
        expect(cooldownReady('other')(busy)).toBe(true)
    })

    it('allOf / anyOf 组合', () => {
        expect(allOf(pressedKey('light'), holdAtLeast(0.3))(ctx)).toBe(true)
        expect(allOf(pressedKey('light'), holdAtLeast(0.5))(ctx)).toBe(false)
        expect(anyOf(pressedKey('heavy'), holdAtLeast(0.3))(ctx)).toBe(true)
        expect(anyOf(pressedKey('heavy'), holdAtLeast(0.5))(ctx)).toBe(false)
    })
})

describe('武器扩展：链编排与追加段（buildMeleeAttacks 选项）', () => {
    it('链编排是增删段的唯一入口：改编排即改播放顺序与 next（无需改状态机）', () => {
        /* heavy 链改成 2 段非循环；light 链顺序反转为 轻2 → 轻1（仍循环） */
        const attacks = buildMeleeAttacks('demo_blade', 'one_handed', {
            chains: {
                light: {steps: ['light_2', 'light_1'], loop: true},
                heavy: {steps: ['heavy_1', 'heavy_2'], loop: false},
            },
        })
        /* 起手 = 编排首段 */
        expect(resolveEntrySegment(attacks, 'light', ctxOf())?.id).toBe('demo_blade_one_handed_light_2')
        expect(chainOf(attacks, 'light').steps).toEqual(['demo_blade_one_handed_light_2', 'demo_blade_one_handed_light_1'])
        /* next 依编排生成：轻2 → 轻1 → 轻2（循环） */
        const light2 = findSegment(attacks, 'demo_blade_one_handed_light_2')!
        const light1 = findSegment(attacks, 'demo_blade_one_handed_light_1')!
        expect(resolveNextSegment(attacks, light2, ctxOf({attackKey: 'light'}))?.id).toBe(light1.id)
        expect(resolveNextSegment(attacks, light1, ctxOf({attackKey: 'light'}))?.id).toBe(light2.id)
        /* 清单顺序跟随编排（每键内按 steps 顺序） */
        expect(orderedSegments(attacks).map(segment => segment.id)).toEqual([
            'demo_blade_one_handed_light_2', 'demo_blade_one_handed_light_1', 'demo_blade_one_handed_heavy_1', 'demo_blade_one_handed_heavy_2',
        ])
    })

    it('非循环链：末段无 next（播完收招），起手仍是首段', () => {
        const attacks = buildMeleeAttacks('demo_spear', 'two_handed', {
            chains: {light: {steps: ['light_1', 'light_2'], loop: false}},
        })
        const light1 = findSegment(attacks, 'demo_spear_two_handed_light_1')!
        const light2 = findSegment(attacks, 'demo_spear_two_handed_light_2')!
        expect(resolveNextSegment(attacks, light1, ctxOf({attackKey: 'light'}))?.id).toBe(light2.id)
        expect(light2.next).toEqual([])
        expect(resolveNextSegment(attacks, light2, ctxOf({attackKey: 'light'}))).toBeUndefined()
        expect(chainOf(attacks, 'light').entries).toEqual([{segmentId: 'demo_spear_two_handed_light_1'}])
    })

    it('追加条件变体段：起手候选守卫 + 挂到某个段的 next 上（无需改状态机）', () => {
        const charge: AttackSegment = {
            id: 'demo_axe_charge', key: 'light', step: 1, label: '蓄力重劈',
            duration: 0.4, recovery: 0.3, phases: [], poses: [{poseId: 'demo_axe_charge', weight: 1}], damageMultiplier: 2, cooldown: 1, next: [],
        }
        const thrust: AttackSegment = {
            id: 'demo_axe_thrust', key: 'light', step: 2, label: '方向突刺',
            duration: 0.25, recovery: 0.2, phases: [], poses: [{poseId: 'demo_axe_thrust', weight: 1}], damageMultiplier: 1, cooldown: 0, next: [],
        }
        const attacks = buildMeleeAttacks('demo_axe', 'dual_wield', {
            extraSegments: [charge, thrust],
            entries: {light: [{segmentId: charge.id, guard: holdAtLeast(0.5)}, {segmentId: 'demo_axe_dual_wield_light_1'}]},
            chains: {light: {steps: ['light_1', 'light_2'], loop: true}},
        })
        /* 追加段可用（清单里出现在所属键末尾） */
        expect(findSegment(attacks, 'demo_axe_charge')).toBe(charge)
        expect(orderedSegments(attacks).map(segment => segment.id)).toEqual([
            'demo_axe_dual_wield_light_1', 'demo_axe_dual_wield_light_2', 'demo_axe_charge', 'demo_axe_thrust',
            'demo_axe_dual_wield_heavy_1', 'demo_axe_dual_wield_heavy_2',
        ])
        /* 起手：长按命中守卫变体，点按落回兜底段 */
        expect(resolveEntrySegment(attacks, 'light', ctxOf({holdDuration: 0.6}))?.id).toBe('demo_axe_charge')
        expect(resolveEntrySegment(attacks, 'light', ctxOf({holdDuration: 0.1}))?.id).toBe('demo_axe_dual_wield_light_1')
    })

    it('追加段 id 与模板段冲突时构建失败（fail loudly）', () => {
        const duplicate: AttackSegment = {
            id: 'demo_sword_one_handed_light_1', key: 'light', step: 1,
            duration: 0.2, recovery: 0.2, phases: [], poses: [{poseId: 'demo_sword_one_handed_light_1', weight: 1}], damageMultiplier: 1, cooldown: 0, next: [],
        }
        expect(() => buildMeleeAttacks('demo_sword', 'one_handed', {extraSegments: [duplicate]})).toThrow()
    })
})

describe('段展示名（segmentDisplayName）', () => {
    it('缺省按 轻击/重击 + 中文序号', () => {
        const attacks = weaponAttacksOf(MELEE_WEAPON_PRESETS.long_sword)
        expect(segmentDisplayName(findSegment(attacks, 'long_sword_one_handed_light_1')!)).toBe('轻击一段')
        expect(segmentDisplayName(findSegment(attacks, 'long_sword_one_handed_light_2')!)).toBe('轻击二段')
        expect(segmentDisplayName(findSegment(attacks, 'long_sword_one_handed_heavy_1')!)).toBe('重击一段')
        expect(segmentDisplayName(findSegment(attacks, 'long_sword_one_handed_heavy_2')!)).toBe('重击二段')
    })

    it('条件变体段用武器模组给的 label', () => {
        const attacks = createTestWeaponRuntime().attacks
        expect(segmentDisplayName(findSegment(attacks, 'test_weapon_charge')!)).toBe('蓄力重劈')
    })
})

describe('武器运行时（createWeaponRuntime）', () => {
    it('伤害覆写生效，未覆写时取预设', () => {
        expect(createWeaponRuntime('long_sword', {damage: 99}).weapon.damage).toBe(99)
        expect(createWeaponRuntime('long_sword').weapon.damage).toBe(MELEE_WEAPON_PRESETS.long_sword.damage)
    })

    it('起手段冷却覆写只作用于起手段（链中段保持预设）', () => {
        const runtime = createWeaponRuntime('long_sword', {cooldown: 0.8})
        expect(runtime.attacks.segments.long_sword_one_handed_light_1.cooldown).toBe(0.8)
        expect(runtime.attacks.segments.long_sword_one_handed_heavy_1.cooldown).toBe(0.8)
        expect(runtime.attacks.segments.long_sword_one_handed_light_2.cooldown).toBe(0)
        /* 不修改武器预设共享数据 */
        expect(weaponAttacksOf(MELEE_WEAPON_PRESETS.long_sword).segments.long_sword_one_handed_light_1.cooldown).toBe(0)
    })

    it('远程弹道数值覆写生效', () => {
        const runtime = createWeaponRuntime('longbow', {
            damage: 7,
            ranged: {range: 3, bulletSpeed: 44, bulletKnockback: 9, bulletLifetime: 1.5},
        })
        const weapon = runtime.weapon
        expect(weapon.type).toBe('ranged')
        if (weapon.type !== 'ranged') return
        expect(weapon.damage).toBe(7)
        expect(weapon.range).toBe(3)
        expect(weapon.projectileSpeed).toBe(44)
        expect(weapon.knockbackForce).toBe(9)
        expect(weapon.projectileLifetime).toBe(1.5)
    })

    it('未知武器 id 回退默认武器（存档容错）', () => {
        expect(weaponPresetOrDefault('nope').id).toBe('long_sword')
        expect(createWeaponRuntime('nope').weapon.id).toBe('long_sword')
    })

    it('测试武器经额外注册表可解析出真实攻击链', () => {
        const runtime = createTestWeaponRuntime()
        expect(runtime.weapon.id).toBe(TEST_WEAPON_ID)
        expect(findWeaponPreset(TEST_WEAPON_ID)?.type).toBe('melee')
        const attacks: WeaponAttacks = runtime.attacks
        expect(Object.keys(attacks.segments)).toHaveLength(6)
    })
})
