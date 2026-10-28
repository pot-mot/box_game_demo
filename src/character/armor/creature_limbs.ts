import type {StringLocaleKey} from '../../i18n/index.ts'

/**
 * 非人形体形「单个肢体配色」元数据（体形 / 槽位 / 颜色）。
 * 肢体件只控制一个槽位的原始肢体模型材质，不改变整身配色；
 * 实体数据（`body_form/<form>/equipment/limb.ts`）与物品表（`inventory/items.ts`）共用这一份定义。
 */
export interface CreatureLimbSlotDef {
    /** 槽位部位 id（与体形 `equipSlots` 的 limb bodyPart 一致） */
    readonly slot: string
    /** 名称后缀（如「爪」「首」「翼」） */
    readonly nameSuffix: string
}

export interface CreatureLimbPalette {
    /** 颜色键（用于生成稳定 id） */
    readonly key: string
    /** 颜色显示名（不含槽位后缀） */
    readonly name: string
    /** 颜色显示名文案键 */
    readonly nameKey: StringLocaleKey
    readonly color: number
    readonly accentColor: number
}

export interface CreatureLimbSet {
    readonly formId: string
    readonly slots: readonly CreatureLimbSlotDef[]
    readonly palettes: readonly CreatureLimbPalette[]
}

export const WOLF_LIMB_SET: CreatureLimbSet = {
    formId: 'wolf',
    slots: [
        {slot: 'claw', nameSuffix: '爪'},
        {slot: 'head', nameSuffix: '首'},
        {slot: 'torso', nameSuffix: '躯'},
        {slot: 'legs', nameSuffix: '腿'},
        {slot: 'tail', nameSuffix: '尾'},
    ],
    palettes: [
        {key: 'blue', name: '蓝毛狼肢', nameKey: 'limb.wolf_blue', color: 0x526572, accentColor: 0x2e3a43},
        {key: 'red', name: '赤毛狼肢', nameKey: 'limb.wolf_red', color: 0x7c4f4a, accentColor: 0x492d29},
        {key: 'white', name: '白毛狼肢', nameKey: 'limb.wolf_white', color: 0xb2ac9d, accentColor: 0x7d786d},
    ],
}

export const HORSE_LIMB_SET: CreatureLimbSet = {
    formId: 'horse',
    slots: [
        {slot: 'head', nameSuffix: '首'},
        {slot: 'torso', nameSuffix: '躯'},
        {slot: 'legs', nameSuffix: '腿'},
        {slot: 'tail', nameSuffix: '尾'},
    ],
    palettes: [
        {key: 'white', name: '白马皮', nameKey: 'limb.horse_white', color: 0xbab2a3, accentColor: 0x80796c},
        {key: 'black', name: '黑马皮', nameKey: 'limb.horse_black', color: 0x2a2723, accentColor: 0x141210},
        {key: 'yellow', name: '黄马皮', nameKey: 'limb.horse_yellow', color: 0x8a6a45, accentColor: 0x4e3a24},
    ],
}

export const WYVERN_LIMB_SET: CreatureLimbSet = {
    formId: 'wyvern',
    slots: [
        {slot: 'wing_claw', nameSuffix: '翼爪'},
        {slot: 'wing', nameSuffix: '翼'},
        {slot: 'head', nameSuffix: '首'},
        {slot: 'torso', nameSuffix: '躯'},
        {slot: 'legs', nameSuffix: '腿'},
        {slot: 'tail', nameSuffix: '尾'},
    ],
    palettes: [
        {key: 'white', name: '白龙鳞', nameKey: 'limb.wyvern_white', color: 0xe8e8e2, accentColor: 0xb8b8b0},
        {key: 'black', name: '黑龙鳞', nameKey: 'limb.wyvern_black', color: 0x2a2a2a, accentColor: 0x141414},
        {key: 'red', name: '赤龙鳞', nameKey: 'limb.wyvern_red', color: 0x7c4f4a, accentColor: 0x492d29},
        {key: 'yellow', name: '黄龙鳞', nameKey: 'limb.wyvern_yellow', color: 0x938049, accentColor: 0x56492a},
        {key: 'purple', name: '紫龙鳞', nameKey: 'limb.wyvern_purple', color: 0x5f476b, accentColor: 0x352a3d},
        {key: 'blue', name: '蓝龙鳞', nameKey: 'limb.wyvern_blue', color: 0x526572, accentColor: 0x2e3a43},
    ],
}

/**
 * 全部非人形体形肢体配色组。
 * 配色采用低明度、低饱和度的土色 / 金属色系，避免高纯度塑料感，贴合严肃游戏基调。
 */
export const CREATURE_LIMB_SETS: readonly CreatureLimbSet[] = [WOLF_LIMB_SET, HORSE_LIMB_SET, WYVERN_LIMB_SET]

/** 肢体预设 id（体形 + 颜色 + 槽位，存档 / 物品共用） */
export const creatureLimbPresetId = (formId: string, colorKey: string, slot: string): string =>
    `${formId}_${colorKey}_${slot}`

/** 单个肢体件名称（颜色名 + 槽位后缀） */
export const creatureLimbPieceName = (palette: CreatureLimbPalette, slot: CreatureLimbSlotDef): string =>
    `${palette.name}·${slot.nameSuffix}`

/** 某体形的肢体配色组 */
export const creatureLimbSetOf = (formId: string): CreatureLimbSet | undefined =>
    CREATURE_LIMB_SETS.find(set => set.formId === formId)
