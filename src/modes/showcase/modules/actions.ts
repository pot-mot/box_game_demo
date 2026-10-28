import type {ShowcaseModule} from '../module.ts'
import {setupActorStage, type ActorStageTab} from '../actor_stage.ts'
import {createShowcaseActor} from '../actor.ts'
import {createNameLabel} from '../label.ts'
import type {ShowcaseActorHandle} from '../actor_handle.ts'
import type {PanelRowInfo} from '../panel.ts'
import {attackModuleDefOf, defaultAttackModule, weaponAttacksOf, weaponPresetOrDefault, weaponDisplayName} from '../../../character/weapon/catalog.ts'
import {composeWithHeavySlot} from '../../../character/combat/attack_modules.ts'
import {createWeaponRuntime} from '../../../character/weapon/weapon_runtime.ts'
import {HOLD_MODES, type HoldMode} from '../../../character/weapon/hold_mode.ts'
import {factionColorOf} from '../../../entity/character/appearance/constants.ts'
import type {WeaponConfig} from '../../../character/weapon/catalog.ts'
import type {WeaponAttacks} from '../../../character/weapon/attack_chain.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {
    MELEE_ROW_Z,
    RANGED_ROW_Z,
    RANGED_SPACING,
    SHOWCASE_ROSTER,
    SHOWCASE_UNARMED_ID,
    showcaseFormSpacingOf,
} from '../constants.ts'

/** 各体形 Tab 的天然 / 允许武器（攻击模组）清单（武器只属于一种体形，用其体形专属 id） */
const CREATURE_TABS: readonly {
    readonly key: string
    readonly labelKey: StringLocaleKey
    readonly modules: readonly {readonly weaponId: string; readonly moduleId: string; readonly breathWeaponId?: string; readonly row?: number}[]
}[] = [
    {key: 'wyvern', labelKey: 'showcase.tab.wyvern', modules: [
        /* 近战排 */
        {weaponId: 'wyvern_claw', moduleId: 'claw', row: 0},
        {weaponId: 'wyvern_wing_blade', moduleId: 'claw', row: 0},
        /* 远程 / 吐息排 */
        {weaponId: 'wyvern_claw', moduleId: 'breath', breathWeaponId: 'breath_natural', row: 1},
        {weaponId: 'wyvern_claw', moduleId: 'breath', breathWeaponId: 'breath_fireball', row: 1},
        {weaponId: 'wyvern_claw', moduleId: 'breath', breathWeaponId: 'breath_lightning', row: 1},
        {weaponId: 'wyvern_claw', moduleId: 'breath', breathWeaponId: 'breath_laser', row: 1},
    ]},
    {key: 'horse', labelKey: 'showcase.tab.horse', modules: [{weaponId: 'horse_iron_hoof', moduleId: 'hoof'}]},
    {key: 'wolf', labelKey: 'showcase.tab.wolf', modules: [
        {weaponId: 'wolf_bite', moduleId: 'mouth'},
        {weaponId: 'wolf_claw', moduleId: 'claw'},
        {weaponId: 'wolf_short_sword', moduleId: 'mouth'},
        {weaponId: 'wolf_long_sword', moduleId: 'mouth'},
        {weaponId: 'wolf_claw_blade', moduleId: 'claw'},
    ]},
]

/** 盾牌（攻击模组 = 盾击；待机 = 格挡姿态） */
const SHIELD_IDS = ['shield_small', 'shield_medium', 'shield_large'] as const

/**
 * 攻击模组展示子模块：以 **Tab** 切换 人 / 龙 / 马 / 狼 各自的攻击模组。
 * - **人形**：近战 6 武器 × 3 持握模式分三排（单持 / 双手共持 / 双持）、远程 9 单排、空手独立一排；
 * - **龙 / 马 / 狼**：该体形的天然 / 允许武器各一个（如龙 = 爪击 / 吐息）。
 * 每角色循环播放其连段；面板复现段计时，并可开关调试箱（碰撞箱 / 受击箱 / 攻击箱）。
 */
export const actionsModule: ShowcaseModule = {
    id: 'actions',
    title: 'showcase.module.actions.title',
    description: 'showcase.module.actions.desc',
    setup: host => {
        let nextId = 0

        const place = (
            scene: Parameters<ActorStageTab['populate']>[0],
            register: (actor: ShowcaseActorHandle, info: PanelRowInfo) => void,
            weapon: WeaponConfig,
            attackModule: string,
            x: number,
            z: number,
            bodyFormId: string,
            breathWeaponId?: string,
        ): void => {
            const id = nextId++
            const breathRuntime = attackModule === 'breath'
                ? createWeaponRuntime(breathWeaponId ?? 'breath_natural')
                : undefined
            const composed = breathRuntime !== undefined && breathRuntime.weapon.type === 'ranged'
                ? composeWithHeavySlot(weaponAttacksOf(weapon, 'breath'), breathRuntime)
                : undefined
            /* 吐息演示只播重击吐息段，不重复展示同一模组里的轻爪部分 */
            const breathOnly: WeaponAttacks | undefined = composed !== undefined
                ? {
                    segments: composed.attacks.segments,
                    chains: {
                        light: {key: 'light', entries: [], steps: []},
                        heavy: composed.attacks.chains.heavy,
                        air: {key: 'air', entries: [], steps: []},
                    },
                }
                : undefined
            const actor = createShowcaseActor({
                id,
                scene,
                weapon,
                attackModule,
                ...(breathOnly !== undefined ? {attacks: breathOnly, attackWeapons: composed?.attackWeapons} : {}),
                ...(breathRuntime !== undefined ? {moduleLabel: weaponDisplayName(breathRuntime.weapon)} : {}),
                faction: id,
                x,
                z,
                weaponName: weaponDisplayName(weapon),
                bodyFormId,
            })
            const moduleDef = attackModuleDefOf(weapon, attackModule)
                ?? attackModuleDefOf(weapon, defaultAttackModule(weapon))
            const moduleLabel = (): string => breathRuntime !== undefined
                ? weaponDisplayName(breathRuntime.weapon)
                : translate(moduleDef?.nameKey ?? 'character.idle')
            actor.attachLabel(createNameLabel(() => ({
                title: weaponDisplayName(weapon),
                subtitle: moduleLabel(),
            })))
            register(actor, {
                id,
                nameOf: () => weaponDisplayName(weapon),
                subOf: moduleLabel,
                colorHex: `#${factionColorOf(id).toString(16).padStart(6, '0')}`,
            })
        }

        const humanoidTab: ActorStageTab = {
            key: 'humanoid',
            labelKey: 'showcase.tab.humanoid',
            populate: (scene, register) => {
                const placeRow = (kind: 'melee' | 'ranged', holdMode: HoldMode | undefined, rowZ: number, spacing: number): void => {
                    const entries = SHOWCASE_ROSTER.filter(e => e.kind === kind && e.holdMode === holdMode)
                    for (let i = 0; i < entries.length; i++) {
                        const entry = entries[i]
                        if (entry === undefined) continue
                        const weapon = weaponPresetOrDefault(entry.skillId)
                        const mode = entry.holdMode ?? defaultAttackModule(weapon)
                        place(scene, register, weapon, mode, (i - (entries.length - 1) / 2) * spacing, rowZ, 'humanoid')
                    }
                }
                const spacing = showcaseFormSpacingOf('humanoid')
                for (const [index, mode] of HOLD_MODES.entries()) {
                    placeRow('melee', mode, MELEE_ROW_Z - index * spacing.z, spacing.x)
                }
                placeRow('ranged', undefined, RANGED_ROW_Z, RANGED_SPACING)
                /* 盾牌：攻击模组（盾击）之外，待机时演示格挡姿态（举盾） */
                const shieldZ = RANGED_ROW_Z - spacing.z
                SHIELD_IDS.forEach((weaponId, i) => {
                    const weapon = weaponPresetOrDefault(weaponId)
                    place(scene, register, weapon, defaultAttackModule(weapon), (i - (SHIELD_IDS.length - 1) / 2) * RANGED_SPACING, shieldZ, 'humanoid')
                })
                /* 空手：独立一排，展示单拳 / 双拳两个攻击模组（无可见武器） */
                const unarmed = weaponPresetOrDefault(SHOWCASE_UNARMED_ID)
                place(scene, register, unarmed, 'one_handed', -RANGED_SPACING / 2, shieldZ - spacing.z, 'humanoid')
                place(scene, register, unarmed, 'dual_wield', RANGED_SPACING / 2, shieldZ - spacing.z, 'humanoid')
            },
        }

        const creatureTabs: ActorStageTab[] = CREATURE_TABS.map(tab => ({
            key: tab.key,
            labelKey: tab.labelKey,
            populate: (scene, register) => {
                const spacing = showcaseFormSpacingOf(tab.key)
                const rows = new Map<number, typeof tab.modules[number][]>()
                for (const entry of tab.modules) {
                    const row = entry.row ?? 0
                    const list = rows.get(row) ?? []
                    list.push(entry)
                    rows.set(row, list)
                }
                for (const [row, entries] of rows) {
                    const n = entries.length
                    entries.forEach((entry, i) => {
                        const weapon = weaponPresetOrDefault(entry.weaponId)
                        place(
                            scene, register, weapon, entry.moduleId,
                            (i - (n - 1) / 2) * spacing.x,
                            RANGED_ROW_Z - row * spacing.z,
                            tab.key, entry.breathWeaponId,
                        )
                    })
                }
            },
        }))

        return setupActorStage(host.renderer, {
            titleKey: 'showcase.title',
            subtitleKey: 'showcase.subtitle',
            tabs: [humanoidTab, ...creatureTabs],
        })
    },
}
