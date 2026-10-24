import {DEFAULT_LOCALE, LOCALES, STORAGE_KEY, isLocale, type Locale} from './constants.ts'
import {localeZhCn} from './zh_cn.ts'
import {localeEn} from './en.ts'
import type {EntityLocale} from './locales/entity.ts'
import type {CatalogLocale} from './locales/catalog.ts'
import type {CharacterLocale} from './locales/character.ts'
import type {PlayLocale} from './locales/play.ts'
import type {ShowcaseLocale} from './locales/showcase.ts'
import type {BoneEditLocale} from './locales/bone_edit.ts'
import type {EditLocale} from './locales/edit.ts'

/**
 * 语言表：**唯一真相源**。扁平的「点分命名空间」键 → 文案。
 * - 普通文案值类型为 `string`；
 * - 需要插值的文案值类型为函数（其参数即插值参数）。
 *
 * 新增/删除键只需改这里与各语言文件，缺少或多余的键在编译期即报错（强类型）。
 * 键分组：common / startup / settings / camera / element / spawn / input / panel ...
 */
type CoreLocale = {
    /* ── 通用 ── */
    'common.apply': string
    'common.delete': string
    'common.cancel': string
    'common.confirm': string
    'common.overwrite': string
    'common.close': string
    'common.add': string
    'common.remove': string
    'common.none': string

    /* ── 启动屏 ── */
    'startup.title': string
    'startup.subtitle': string
    'startup.mode.edit': string
    'startup.mode.play': string
    'startup.mode.showcase': string
    'startup.mode.bone_edit': string
    'startup.import_label': string
    'startup.choose_file': string
    'startup.no_file': string
    'startup.imported': (file: string) => string
    'startup.invalid_save': string
    'startup.parse_failed': string
    'startup.has_cache': string
    'startup.clear': string

    /* ── 存档加载提示 ── */
    'save.skipped_title': string
    'save.skipped_message': (count: number) => string
    'save.skipped_entry': (index: number, type: string) => string
    'save.skipped_unknown_type': string

    /* ── 设置菜单 ── */
    'settings.title': string
    'settings.return_home': string
    'settings.operations': string
    'settings.save_world': string
    'settings.teleport_save': string
    'settings.language': string

    /* ── 相机 HUD ── */
    'camera.pos': (x: string, y: string, z: string) => string
    'camera.rot': (x: string, y: string, z: string) => string
    'camera.zoom': (zoom: string) => string

    /* ── 实体列表 ── */
    'element.title': string
    'element.empty': string
    'element.delete': string
    'element.group.character': string
    'element.group.box': string
    'element.group.area': string
    'element.group.terrain': string
    'element.group.building': string
    'element.group.fragment': string
    'element.group.interactable': string
    'element.group.item': string
    'element.group.other': string

    /* ── 生成类型选择 ── */
    'spawn.box': string
    'spawn.area': string
    'spawn.character': string
    'spawn.terrain': string
    'spawn.building': string
    'spawn.interactable': string

    /* ── 操作设置面板 ── */
    'input.operations_title': string
    'input.reset_defaults': string
    'input.import_config': string
    'input.export_config': string
    'input.conflict_title': string
    'input.conflict_message': (names: string) => string
    'input.replace_binding': string
    'input.delete_binding': string
    'input.add_alt_binding': string
    'input.fixed': string
    'input.capture_prompt': string
    'input.mouse_group': string
    'input.toast.import_success': string
    'input.toast.invalid_root': string
    'input.toast.missing_action': (action: string) => string
    'input.toast.no_binding': (action: string) => string
    'input.toast.bad_combo': (action: string) => string
    'input.toast.parse_error': string
    'input.code.mouse_left': string
    'input.code.mouse_middle': string
    'input.code.mouse_right': string
    'input.code.mouse_side1': string
    'input.code.mouse_side2': string
    'input.group.move': string
    'input.group.character': string
    'input.group.edit_tools': string
    'input.group.ui': string
    'input.group.system': string
    'input.fixed.key.click_left': string
    'input.fixed.key.wheel': string
    'input.fixed.key.drag_gizmo': string
    'input.fixed.key.dbl_timeline': string
    'input.fixed.key.ctrl_wheel': string
    'input.fixed.label.edit_select': string
    'input.fixed.label.zoom_camera': string
    'input.fixed.label.bone_select': string
    'input.fixed.label.bone_transform_gizmo': string
    'input.fixed.label.bone_add_key': string
    'input.fixed.label.bone_zoom_timeline': string
    'input.action.move_forward': string
    'input.action.move_backward': string
    'input.action.move_left': string
    'input.action.move_right': string
    'input.action.move_up': string
    'input.action.move_down': string
    'input.action.jump': string
    'input.action.roll': string
    'input.action.boost': string
    'input.action.cycle_hold_mode': string
    'input.action.cycle_spawn_up': string
    'input.action.cycle_spawn_down': string
    'input.action.delete_entity': string
    'input.action.close_panel': string
    'input.action.interact': string
    'input.action.open_inventory': string
    'input.action.open_equipment': string
    'input.action.open_map': string
    'input.action.save_world': string
    'input.action.load_world': string
    'input.action.mouse_orbit': string
    'input.action.mouse_pan': string
    'input.action.spawn_entity': string
    'input.action.lock_target': string
    'input.action.attack_light': string
    'input.action.attack_heavy': string
    'input.action.showcase_focus': string
    'input.action.toggle_debug_hud': string

    /* ── 实体面板通用 ── */
    'panel.pos': string
    'panel.rot': string
    'panel.size': string
    'panel.health': string
    'panel.config': string
    'panel.faction': string
    'panel.position': string
    'panel.attraction': string
    'panel.elastic': string
    'panel.buoyancy': string
    'panel.lifetime': string
    'panel.generator': string
    'panel.height': string
    'panel.recipe': string
    'panel.props': string
    'panel.material_replace': string
    'panel.size_voxel': string
    'panel.x': string
    'panel.y': string
    'panel.z': string
    'panel.density': string
    'panel.friction': string
    'panel.radius': string
    'panel.strength': string
    'panel.seed': string
    'panel.hp': string
    'panel.max': string
    'panel.min': string
    'panel.grid': string
    'panel.cell': string
    'panel.stiffness': string
    'panel.damping': string
    'panel.max_deform': string
    'panel.fragment_count': string
    'panel.material': string
    'panel.traits': string
    'panel.shape': string
    'panel.shape_kind': string
    'panel.shape.box': string
    'panel.shape.sphere': string
    'panel.shape.cylinder': string
    'panel.fields': string
    'panel.drag': string
    'panel.flow_speed': string
    'panel.direction': string
    'panel.accel': string
}

/** 完整语言表：核心键 + 各领域文案域（各域独立文件维护，避免单文件膨胀） */
export type MainLocale =
    & CoreLocale
    & EntityLocale
    & CatalogLocale
    & CharacterLocale
    & PlayLocale
    & ShowcaseLocale
    & BoneEditLocale
    & EditLocale

/** 值为 `string` 的键（可直接传给 `translate`） */
export type StringLocaleKey = {
    [K in keyof MainLocale]: MainLocale[K] extends string ? K : never
}[keyof MainLocale]

/** 值为函数的键（需要以 `{key, args}` 形式调用） */
export type ParamLocaleKey = {
    [K in keyof MainLocale]: MainLocale[K] extends (...args: infer _A) => string ? K : never
}[keyof MainLocale]

/** `translate` 的入参：字符串键直传，参数键传 `{key, args}`（args 由键对应的函数签名推导） */
export type LocalKeyParam = StringLocaleKey | {
    [K in keyof MainLocale]: MainLocale[K] extends (...args: infer A) => string
        ? {key: K; args: A}
        : never
}[keyof MainLocale]

const LOCALE_TABLES: Record<Locale, MainLocale> = {
    'zh-cn': localeZhCn,
    en: localeEn,
}

const loadStoredLocale = (): Locale => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return isLocale(raw) ? raw : DEFAULT_LOCALE
    } catch {
        return DEFAULT_LOCALE
    }
}

const storeLocale = (locale: Locale): void => {
    try {
        localStorage.setItem(STORAGE_KEY, locale)
    } catch {
        /* 隐私模式 / 配额满：静默忽略，仅影响持久化 */
    }
}

let currentLocale: Locale = loadStoredLocale()

const listeners = new Set<() => void>()

/** 当前语言 */
export const getLocale = (): Locale => currentLocale

/** 受支持语言清单（运行时值） */
export const getLocales = (): readonly Locale[] => LOCALES

/** 切换语言：持久化并通知所有订阅者 */
export const setLocale = (locale: Locale): void => {
    if (locale === currentLocale) return
    currentLocale = locale
    storeLocale(locale)
    try {
        document.documentElement.lang = locale
    } catch {
        /* 非 DOM 环境（测试）忽略 */
    }
    for (const listener of listeners) listener()
}

/** 订阅语言切换，返回取消订阅函数 */
export const onLocaleChange = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/**
 * 取文案：字符串键直接查表；参数键以 `{key, args}` 形式调用对应函数。
 * 未知键（理论上不会出现，类型系统已约束）安全回退为键名本身。
 */
export const translate = (keyParam: LocalKeyParam): string => {
    const table = LOCALE_TABLES[currentLocale]
    if (typeof keyParam === 'string') {
        return table[keyParam]
    }
    const entry = table[keyParam.key]
    if (typeof entry !== 'function') {
        return String(keyParam.key)
    }
    return Reflect.apply(entry, undefined, keyParam.args)
}
