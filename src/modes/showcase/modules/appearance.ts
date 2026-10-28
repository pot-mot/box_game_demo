import type {ShowcaseModule} from '../module.ts'
import {setupActorStage, type ActorStageTab} from '../actor_stage.ts'
import {createRaceActor} from '../race_actor.ts'
import {createCreatureActor} from '../creature_actor.ts'
import {createNameLabel} from '../label.ts'
import type {ArmorLoadout, LimbLoadout, LimbPieceConfig} from '../../../character/armor/types.ts'
import type {EquipmentState} from '../../../character/equipment/types.ts'
import type {BodyForm} from '../../../entity/character/body_form/common/types.ts'
import {bodyFormOf} from '../../../entity/character/body_form/index.ts'
import type {WeaponConfig} from '../../../character/weapon/catalog.ts'
import {weaponDisplayName} from '../../../character/weapon/catalog.ts'
import {armorPieceDisplayName} from '../../../character/armor/catalog.ts'
import {translate} from '../../../i18n/index.ts'
import {factionColorOf} from '../../../entity/character/appearance/constants.ts'
import {
    ARMOR_SET_SHOWCASE,
    CREATURE_EQUIPMENT_SHOWCASE_TABS,
    RACE_SHOWCASE_ROSTER,
    showcaseFormSpacingOf,
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

/** 装备外观色点（非人形体形固定配色，与阵营无关） */
const CREATURE_COLOR_HEX = '#7a7a7a'

/** 部位 → 装备 id 的完整装载表（空表 = 该类别不装备） */
const loadoutOf = (pieces: readonly {readonly slot: string; readonly id: string}[]): Readonly<Record<string, string>> =>
    Object.fromEntries(pieces.map(piece => [piece.slot, piece.id]))

/** 体形默认武器（取 `defaultWeaponLoadout` 中首个属于 `weapons` 的条目；无则首个武器） */
const defaultWeaponOf = (form: BodyForm): WeaponConfig | undefined => {
    for (const id of Object.values(form.defaultWeaponLoadout)) {
        const weapon = form.weapons.find(candidate => candidate.id === id)
        if (weapon !== undefined) return weapon
    }
    return form.weapons[0]
}

/**
 * 外观子模块：整套装备 / 种族 / 体形图鉴。
 * - Tab「人」：三族肢体（骷髅 / 兽人 / 精灵，四槽同族肢体 replace）+ 各材质护甲**整套**
 *   （布 / 皮 / 铁 / 鳞 / 石 / 法师，四槽同套，每行 3 套）；
 * - Tab「龙 / 马 / 狼」（`CREATURE_EQUIPMENT_SHOWCASE_TABS`）：该体形的**全套护甲**、**全套肢体**
 *   与**全部武器**外观；护甲与肢体分层展示，避免同槽两套网格互相遮挡；
 * - 动作不再定时轮换，统一由左侧面板「当前动作」切换；支持全部非攻击基础状态（含游泳 / 漂浮等），
 *   位置原地不动，纯外观展示。
 */
export const appearanceModule: ShowcaseModule = {
    id: 'appearance',
    title: 'showcase.module.appearance.title',
    description: 'showcase.module.appearance.desc',
    setup: host => {
        /* 展示角色 id 必须跨 Tab 全局唯一：聚焦下拉 / 面板行按 id 反查角色，
         * 各 Tab 各自从 0 计数会聚焦到其它 Tab 的同号角色，表现为相机飞到错误位置。 */
        let nextId = 0
        return setupActorStage(host.renderer, {
            titleKey: 'showcase.module.appearance.title',
            subtitleKey: 'showcase.module.appearance.desc',
            actionPicker: {initial: 'idle'},
            tabs: [
                {
                    key: 'humanoid',
                    labelKey: 'showcase.tab.humanoid',
                    populate: (scene, register) => {
                        let rowIndex = 0
                        const spacing = showcaseFormSpacingOf('humanoid')

                        const placeRow = (entries: readonly AppearanceEntry[]): void => {
                            const z = -rowIndex * spacing.z
                            for (let i = 0; i < entries.length; i++) {
                                const entry = entries[i]
                                if (entry === undefined) continue
                                const id = nextId++
                                const actor = createRaceActor({
                                    id,
                                    scene,
                                    x: (i - (entries.length - 1) / 2) * spacing.x,
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
                    },
                },
                ...CREATURE_EQUIPMENT_SHOWCASE_TABS.map((tab): ActorStageTab => ({
                    key: tab.bodyFormId,
                    labelKey: tab.labelKey,
                    populate: (scene, register) => {
                        let rowIndex = 0
                        const form = bodyFormOf(tab.bodyFormId)
                        const defaultWeapon = defaultWeaponOf(form)
                        const spacing = showcaseFormSpacingOf(tab.bodyFormId)

                        const place = (
                            equipment: EquipmentState,
                            weapon: WeaponConfig | undefined,
                            nameOf: () => string,
                            subOf: () => string,
                            x: number,
                            z: number,
                        ): void => {
                            const id = nextId++
                            const actor = createCreatureActor({
                                id,
                                scene,
                                x,
                                z,
                                name: nameOf(),
                                subtitle: subOf(),
                                bodyFormId: tab.bodyFormId,
                                equipment,
                                ...(weapon !== undefined ? {weapon} : {}),
                            })
                            actor.attachLabel(createNameLabel(() => ({title: nameOf(), subtitle: subOf()}), actor.labelHeight))
                            register(actor, {id, nameOf, subOf, colorHex: CREATURE_COLOR_HEX})
                        }

                        /** 一行展示条目：装备状态 + 武器 + 惰性名称 / 副名 */
                        interface CreatureRowEntry {
                            readonly equipment: EquipmentState
                            readonly weapon: WeaponConfig | undefined
                            readonly nameOf: () => string
                            readonly subOf: () => string
                        }

                        const placeRow = (entries: readonly CreatureRowEntry[]): void => {
                            const z = -rowIndex * spacing.z
                            for (let i = 0; i < entries.length; i++) {
                                const entry = entries[i]
                                if (entry === undefined) continue
                                place(
                                    entry.equipment,
                                    entry.weapon,
                                    entry.nameOf,
                                    entry.subOf,
                                    (i - (entries.length - 1) / 2) * spacing.x,
                                    z,
                                )
                            }
                            rowIndex++
                        }

                        /* 护甲套装：按体形声明的套装分组逐套展示（缺省 = 全部护甲视为一套） */
                        const armorSets = form.armorSets
                            ?? (form.armorPieces !== undefined && form.armorPieces.length > 0
                                ? [{nameKey: form.nameKey, armor: loadoutOf(form.armorPieces)}]
                                : [])
                        if (armorSets.length > 0) {
                            placeRow(armorSets.map(set => ({
                                equipment: {weapon: {}, armor: set.armor, limb: {}},
                                weapon: defaultWeapon,
                                nameOf: () => translate(set.nameKey),
                                subOf: () => translate('showcase.extra.armor_set'),
                            })))
                        }

                        /* 肢体：按颜色分组，每色一个展示角色（该色全部槽位同时替换为对应肢体） */
                        const limbPieces: readonly LimbPieceConfig[] = form.limbPieces ?? []
                        const limbGroups = new Map<string, LimbPieceConfig[]>()
                        for (const piece of limbPieces) {
                            const key = piece.nameKey ?? piece.id
                            const group = limbGroups.get(key) ?? []
                            group.push(piece)
                            limbGroups.set(key, group)
                        }
                        if (limbGroups.size > 0) {
                            placeRow([...limbGroups.values()].map(pieces => {
                                const first = pieces[0]
                                if (first === undefined) throw new Error(`${tab.bodyFormId} 肢体颜色组为空`)
                                return {
                                    equipment: {
                                        weapon: {},
                                        armor: {},
                                        limb: Object.fromEntries(pieces.map(piece => [piece.slot, piece.id])),
                                    },
                                    weapon: defaultWeapon,
                                    nameOf: () => armorPieceDisplayName(first),
                                    subOf: () => translate('showcase.creature_set.limb'),
                                }
                            }))
                        }

                        /* 全部武器外观：逐把展示（天然武器同样列出，标签说明武器类型） */
                        placeRow(form.weapons.map(weapon => ({
                            equipment: {weapon: {}, armor: {}, limb: {}},
                            weapon,
                            nameOf: () => weaponDisplayName(weapon),
                            subOf: () => translate('showcase.creature_set.weapon'),
                        })))
                    },
                })),
            ],
        })
    },
}
