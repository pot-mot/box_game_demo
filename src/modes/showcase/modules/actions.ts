import type {ShowcaseModule} from '../module.ts'
import {setupActorStage} from '../actor_stage.ts'
import {createShowcaseActor} from '../actor.ts'
import {createNameLabel} from '../label.ts'
import {weaponPresetOrDefault, defaultHoldMode, weaponDisplayName} from '../../../character/weapon/catalog.ts'
import {HOLD_MODES, HOLD_MODE_LABELS, type HoldMode} from '../../../character/weapon/hold_mode.ts'
import {factionColorOf} from '../../../entity/character/appearance/constants.ts'
import {translate} from '../../../i18n/index.ts'
import {
    MELEE_ROW_Z,
    MELEE_ROW_SPACING,
    MELEE_SPACING,
    RANGED_ROW_Z,
    RANGED_SPACING,
    SHOWCASE_ROSTER,
} from '../constants.ts'

/**
 * 动作子模块：全武器攻击动作展示台（复用原展示模式内容）。
 * 近战 6 武器 × 3 持握模式分三排（单持 → 双手共持 → 双持），远程 9 单排，
 * 每角色循环播放其连段（轻链 → 停顿 → 重链），信息面板复现段计时。
 */
export const actionsModule: ShowcaseModule = {
    id: 'actions',
    title: 'showcase.module.actions.title',
    description: 'showcase.module.actions.desc',
    setup: host => setupActorStage(host.renderer, {
        titleKey: 'showcase.title',
        subtitleKey: 'showcase.subtitle',
        populate: (scene, register) => {
            let nextFaction = 0
            const placeRow = (kind: 'melee' | 'ranged', holdMode: HoldMode | undefined, rowZ: number, spacing: number): void => {
                const entries = SHOWCASE_ROSTER.filter(e => e.kind === kind && e.holdMode === holdMode)
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i]
                    if (entry === undefined) continue
                    const weapon = weaponPresetOrDefault(entry.skillId)
                    const mode = entry.holdMode ?? defaultHoldMode(weapon)
                    const actor = createShowcaseActor({
                        id: nextFaction,
                        scene,
                        weapon,
                        holdMode: mode,
                        faction: nextFaction,
                        x: (i - (entries.length - 1) / 2) * spacing,
                        z: rowZ,
                        weaponName: weaponDisplayName(weapon.id, weapon.name),
                    })
                    actor.attachLabel(createNameLabel(() => ({
                        title: weaponDisplayName(weapon.id, weapon.name),
                        subtitle: weapon.type === 'melee'
                            ? translate({key: 'showcase.weapon.melee_subtitle', args: [translate(HOLD_MODE_LABELS[mode])]})
                            : translate('showcase.weapon.ranged'),
                    })))
                    register(actor, {
                        id: actor.id,
                        nameOf: () => weaponDisplayName(weapon.id, weapon.name),
                        subOf: () => translate(HOLD_MODE_LABELS[mode]),
                        colorHex: `#${factionColorOf(nextFaction).toString(16).padStart(6, '0')}`,
                    })
                    nextFaction++
                }
            }
            for (const [index, mode] of HOLD_MODES.entries()) {
                placeRow('melee', mode, MELEE_ROW_Z - index * MELEE_ROW_SPACING, MELEE_SPACING)
            }
            placeRow('ranged', undefined, RANGED_ROW_Z, RANGED_SPACING)
        },
    }),
}
