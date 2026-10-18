import type {ShowcaseModule} from '../module.ts'
import {setupActorStage, type ActorStageTab} from '../actor_stage.ts'
import {createShowcaseActor} from '../actor.ts'
import {createNameLabel} from '../label.ts'
import type {ShowcaseActorHandle} from '../actor_handle.ts'
import type {PanelRowInfo} from '../panel.ts'
import {weaponPresetOrDefault, defaultHoldMode, weaponDisplayName} from '../../../character/weapon/catalog.ts'
import {HOLD_MODES, HOLD_MODE_LABELS, type HoldMode} from '../../../character/weapon/hold_mode.ts'
import {factionColorOf} from '../../../entity/character/appearance/constants.ts'
import type {WeaponConfig} from '../../../character/weapon/catalog.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {
    MELEE_ROW_Z,
    MELEE_ROW_SPACING,
    MELEE_SPACING,
    RANGED_ROW_Z,
    RANGED_SPACING,
    SHOWCASE_ROSTER,
} from '../constants.ts'

/** 各体形 Tab 的天然 / 允许武器（攻击模组）清单（武器只属于一种体形，用其体形专属 id） */
const CREATURE_TABS: readonly {readonly key: string; readonly labelKey: StringLocaleKey; readonly weapons: readonly string[]}[] = [
    {key: 'wyvern', labelKey: 'showcase.tab.wyvern', weapons: ['wyvern_claw', 'wyvern_breath']},
    {key: 'horse', labelKey: 'showcase.tab.horse', weapons: ['horse_kick', 'horse_spear', 'horse_throwing_axe']},
    {key: 'wolf', labelKey: 'showcase.tab.wolf', weapons: ['wolf_bite', 'wolf_short_sword', 'wolf_long_sword']},
]

/** 盾牌（攻击模组 = 盾击；待机 = 格挡姿态） */
const SHIELD_IDS = ['shield_small', 'shield_medium', 'shield_large'] as const

/**
 * 攻击模组展示子模块：以 **Tab** 切换 人 / 龙 / 马 / 狼 各自的攻击模组。
 * - **人形**：近战 6 武器 × 3 持握模式分三排（单持 → 双手共持 → 双持）+ 远程 9 单排；
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
            holdMode: HoldMode,
            x: number,
            z: number,
            bodyFormId: string,
        ): void => {
            const id = nextId++
            const actor = createShowcaseActor({
                id,
                scene,
                weapon,
                holdMode,
                faction: id,
                x,
                z,
                weaponName: weaponDisplayName(weapon),
                bodyFormId,
            })
            actor.attachLabel(createNameLabel(() => ({
                title: weaponDisplayName(weapon),
                subtitle: weapon.type === 'melee'
                    ? translate({key: 'showcase.weapon.melee_subtitle', args: [translate(HOLD_MODE_LABELS[holdMode])]})
                    : translate('showcase.weapon.ranged'),
            })))
            register(actor, {
                id,
                nameOf: () => weaponDisplayName(weapon),
                subOf: () => translate(HOLD_MODE_LABELS[holdMode]),
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
                        const mode = entry.holdMode ?? defaultHoldMode(weapon)
                        place(scene, register, weapon, mode, (i - (entries.length - 1) / 2) * spacing, rowZ, 'humanoid')
                    }
                }
                for (const [index, mode] of HOLD_MODES.entries()) {
                    placeRow('melee', mode, MELEE_ROW_Z - index * MELEE_ROW_SPACING, MELEE_SPACING)
                }
                placeRow('ranged', undefined, RANGED_ROW_Z, RANGED_SPACING)
                /* 盾牌：攻击模组（盾击）之外，待机时演示格挡姿态（举盾） */
                const shieldZ = RANGED_ROW_Z - MELEE_ROW_SPACING
                SHIELD_IDS.forEach((weaponId, i) => {
                    const weapon = weaponPresetOrDefault(weaponId)
                    place(scene, register, weapon, defaultHoldMode(weapon), (i - (SHIELD_IDS.length - 1) / 2) * RANGED_SPACING, shieldZ, 'humanoid')
                })
            },
        }

        const creatureTabs: ActorStageTab[] = CREATURE_TABS.map(tab => ({
            key: tab.key,
            labelKey: tab.labelKey,
            populate: (scene, register) => {
                const n = tab.weapons.length
                tab.weapons.forEach((weaponId, i) => {
                    const weapon = weaponPresetOrDefault(weaponId)
                    place(scene, register, weapon, defaultHoldMode(weapon), (i - (n - 1) / 2) * RANGED_SPACING, RANGED_ROW_Z, tab.key)
                })
            },
        }))

        return setupActorStage(host.renderer, {
            titleKey: 'showcase.title',
            subtitleKey: 'showcase.subtitle',
            tabs: [humanoidTab, ...creatureTabs],
        })
    },
}
