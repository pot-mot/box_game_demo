import type {ShowcaseModule} from '../module.ts'
import {setupActorStage} from '../actor_stage.ts'
import {createRaceActor} from '../race_actor.ts'
import {createCreatureActor} from '../creature_actor.ts'
import {createNameLabel} from '../label.ts'
import type {ArmorLoadout, LimbLoadout} from '../../../character/armor/types.ts'
import {translate} from '../../../i18n/index.ts'
import {factionColorOf} from '../../../entity/character/appearance/constants.ts'
import {
    ARMOR_SET_SHOWCASE,
    CREATURE_SHOWCASE_ROSTER,
    RACE_SHOWCASE_ROSTER,
    SHOWCASE_APPEARANCE_SPACING,
    SHOWCASE_APPEARANCE_ROW_SPACING,
} from '../constants.ts'

/** 外观图鉴条目：一个展示角色 + 名称 / 副名（惰性求值以随语言切换重译）/ 阵营 / 装备 */
interface AppearanceEntry {
    readonly nameOf: () => string
    readonly subOf: () => string
    readonly faction: number
    readonly limb: LimbLoadout
    readonly armor: ArmorLoadout
}

/** 整套护甲每行展示数量 */
const SETS_PER_ROW = 3

/**
 * 外观子模块：整套装备 / 种族 / 体形图鉴。
 * - 第一排：三族肢体（骷髅 / 兽人 / 精灵，四槽同族肢体 replace）；
 * - 第二排起：各材质护甲**整套**（布 / 皮 / 铁 / 鳞 / 石 / 法师，四槽同套），每行 3 套；
 * - 末排：非人形体形（狼 / 马 / 双足飞龙）。
 * 全部角色站立 2s ↔ 行走 2s 交替循环（`RACE_SHOWCASE_HOLD_SECONDS`），位置原地不动，纯外观展示。
 */
export const appearanceModule: ShowcaseModule = {
    id: 'appearance',
    title: 'showcase.module.appearance.title',
    description: 'showcase.module.appearance.desc',
    setup: host => setupActorStage(host.renderer, {
        titleKey: 'showcase.module.appearance.title',
        subtitleKey: 'showcase.module.appearance.desc',
        tabs: [{
            key: 'appearance',
            labelKey: 'showcase.module.appearance.title',
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

            /* 整套护甲：每行 3 套（以整套为整体预览，不单件展示） */
            for (let r = 0; r < ARMOR_SET_SHOWCASE.length; r += SETS_PER_ROW) {
                const chunk = ARMOR_SET_SHOWCASE.slice(r, r + SETS_PER_ROW)
                placeRow(chunk.map(set => ({
                    nameOf: () => translate(set.nameKey),
                    subOf: () => translate('showcase.extra.armor_set'),
                    faction: set.faction,
                    limb: {},
                    armor: set.armor,
                })))
            }

            /* 末排：非人形体形（狼 / 马 / 双足飞龙），循环播放对应体形的 idle ↔ walking */
            const creatureEntries = CREATURE_SHOWCASE_ROSTER
            const creatureZ = -rowIndex * SHOWCASE_APPEARANCE_ROW_SPACING
            for (let i = 0; i < creatureEntries.length; i++) {
                const entry = creatureEntries[i]
                if (entry === undefined) continue
                const id = nextId++
                const actor = createCreatureActor({
                    id,
                    scene,
                    x: (i - (creatureEntries.length - 1) / 2) * SHOWCASE_APPEARANCE_SPACING,
                    z: creatureZ,
                    name: translate(entry.name),
                    subtitle: translate('showcase.extra.body_form'),
                    bodyFormId: entry.bodyFormId,
                })
                actor.attachLabel(createNameLabel(() => ({title: translate(entry.name), subtitle: translate('showcase.extra.body_form')}), actor.labelHeight))
                register(actor, {
                    id,
                    nameOf: () => translate(entry.name),
                    subOf: () => translate('showcase.extra.body_form'),
                    colorHex: '#7a7a7a',
                })
            }
            rowIndex++
            },
        }],
    }),
}
