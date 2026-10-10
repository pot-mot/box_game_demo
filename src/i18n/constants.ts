/** 支持的语言标识 */
export const LOCALES = ['zh-cn', 'en'] as const
export type Locale = typeof LOCALES[number]

/** 默认语言（localStorage 无有效记录时回退） */
export const DEFAULT_LOCALE: Locale = 'zh-cn'

/** 语言偏好 localStorage 键名 */
export const STORAGE_KEY = 'box_demo_language'

/** 语言显示名（语言切换控件使用，通常与当前语言无关，故不进 locale 表） */
export const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
    'zh-cn': '中文',
    en: 'English',
}

/** 判断任意值是否为受支持语言 */
export const isLocale = (value: unknown): value is Locale =>
    typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
