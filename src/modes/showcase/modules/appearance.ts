import type {ShowcaseModule} from '../module.ts'
import {setupActorStage} from '../actor_stage.ts'
import {createRaceActor} from '../race_actor.ts'
import {createNameLabel} from '../label.ts'
import {ALL_ARMOR_PRESETS, armorPieceDisplayName} from '../../../character/armor/catalog.ts'
import type {ArmorPieceConfig, ArmorLoadout, LimbLoadout} from '../../../character/armor/types.ts'
import {ARMOR_SLOTS, type ArmorSlot} from '../../../character/armor/slots.ts'
import type {StringLocaleKey} from '../../../i18n/index.ts'
import {translate} from '../../../i18n/index.ts'
import {factionColorOf} from '../../../entity/character/appearance/constants.ts'
import {RACE_SHOWCASE_ROSTER, SHOWCASE_APPEARANCE_SPACING, SHOWCASE_APPEARANCE_ROW_SPACING} from '../constants.ts'

/** 外观图鉴条目：一个展示角色 + 名称 / 副名（惰性求值以随语言切换重译）/ 阵营 / 装备 */
interface AppearanceEntry {
    readonly nameOf: () => string
    readonly subOf: () => string
    readonly faction: number
    readonly limb: LimbLoadout
    readonly armor: ArmorLoadout
}

const ARMOR_SLOT_LOCALE: Record<ArmorSlot, StringLocaleKey> = {
    head: 'armor_slot.head',
    chest: 'armor_slot.chest',
    arms: 'armor_slot.arms',
    legs: 'armor_slot.legs',
}

/** 护甲件副名：槽位 + 逐类别防御 + 移速（本地化拼接） */
const armorSubtitle = (piece: ArmorPieceConfig): string => translate({
    key: 'showcase.appearance.armor_stat',
    args: [
        translate(ARMOR_SLOT_LOCALE[piece.slot]),
        String(piece.defense.physical),
        String(piece.defense.magic),
        piece.moveSpeedMultiplier.toFixed(2),
    ],
})

/**
 * 外观子模块：种族 / 套装 / 护甲件图鉴。
 * - 第一排：三族肢体（骷髅 / 兽人 / 精灵，四槽同族肢体 replace）；
 * - 后续排：按槽位分组逐个展示全部护甲预设（人类身体 + 单件护甲，标注槽位与数值）。
 * 全部角色站立 2s ↔ 行走 2s 交替循环（`RACE_SHOWCASE_HOLD_SECONDS`），位置原地不动，纯外观展示。
 */
export const appearanceModule: ShowcaseModule = {
    id: 'appearance',
    title: 'showcase.module.appearance.title',
    description: 'showcase.module.appearance.desc',
    setup: host => setupActorStage(host.renderer, {
        titleKey: 'showcase.module.appearance.title',
        subtitleKey: 'showcase.module.appearance.desc',
        populate: (scene, register) => {
            let nextId = 0
            let rowIndex = 0

            const placeRow = (entries: readonly AppearanceEntry[]): void => {
                const z = -rowIndex * SHOWCASE_APPEARANCE_ROW_SPACING
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i]
                    if (entry === undefined) continue
                    const id = nextId++
                    const actor = createRaceActor({
                        id,
                        scene,
                        x: (i - (entries.length - 1) / 2) * SHOWCASE_APPEARANCE_SPACING,
                        z,
                        name: entry.nameOf(),
                        subtitle: entry.subOf(),
                        faction: entry.faction,
                        limb: entry.limb,
                        armor: entry.armor,
                    })
                    actor.attachLabel(createNameLabel(() => ({title: entry.nameOf(), subtitle: entry.subOf()})))
                    register(actor, {
                        id,
                        nameOf: entry.nameOf,
                        subOf: entry.subOf,
                        colorHex: `#${factionColorOf(entry.faction).toString(16).padStart(6, '0')}`,
                    })
                }
                rowIndex++
            }

            /* 第一排：三族肢体 */
            const raceEntries: AppearanceEntry[] = RACE_SHOWCASE_ROSTER
                .filter(entry => entry.kind === 'race')
                .map(entry => ({
                    nameOf: () => translate(entry.name),
                    subOf: () => translate('showcase.extra.race_limb'),
                    faction: entry.faction,
                    limb: entry.limb,
                    armor: {},
                }))
            placeRow(raceEntries)

            /* 后续排：按槽位分组展示全部护甲件（人类身体 + 单件）；阵营 3/4/5 循环着色 */
            let pieceIndex = 0
            for (const slot of ARMOR_SLOTS) {
                const pieces = ALL_ARMOR_PRESETS.filter(piece => piece.slot === slot)
                if (pieces.length === 0) continue
                placeRow(pieces.map(piece => ({
                    nameOf: () => armorPieceDisplayName(piece),
                    subOf: () => armorSubtitle(piece),
                    faction: 3 + (pieceIndex++ % 3),
                    limb: {},
                    armor: {[slot]: piece.id},
                })))
            }
        },
    }),
}
