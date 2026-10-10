import {onLocaleChange, translate, type LocalKeyParam} from './index.ts'

export type {LocalKeyParam} from './index.ts'

type ValueSetter = (el: HTMLElement, value: string) => void

interface Registration {
    readonly ref: WeakRef<HTMLElement>
    readonly set: ValueSetter
    readonly key: LocalKeyParam
}

const setTextContent: ValueSetter = (el, value) => { el.textContent = value }
const setTitle: ValueSetter = (el, value) => { el.title = value }
const setPlaceholder: ValueSetter = (el, value) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.placeholder = value
    }
}

const registrations: Registration[] = []

/** 计算型登记：刷新时按 `apply` 重新计算结果（用于下拉选项、属性/文本属性等无法用固定键表达的文案） */
interface ApplyRegistration {
    readonly ref: WeakRef<HTMLElement>
    readonly apply: (el: HTMLElement) => void
}

const applyRegistrations: ApplyRegistration[] = []

/** 登记数量超过该阈值时进行惰性压缩（清理已失效的 WeakRef，避免重建型下拉长期累积死登记） */
const COMPACT_THRESHOLD = 256

/** 清理已失效登记（元素已被回收） */
const compactRegistrations = (): void => {
    if (registrations.length > COMPACT_THRESHOLD) {
        for (let i = registrations.length - 1; i >= 0; i--) {
            if (registrations[i].ref.deref() === undefined) registrations.splice(i, 1)
        }
    }
    if (applyRegistrations.length > COMPACT_THRESHOLD) {
        for (let i = applyRegistrations.length - 1; i >= 0; i--) {
            if (applyRegistrations[i].ref.deref() === undefined) applyRegistrations.splice(i, 1)
        }
    }
}

const applyRegistration = (reg: Registration): boolean => {
    const el = reg.ref.deref()
    if (el === undefined) return false
    reg.set(el, translate(reg.key))
    return true
}

/** 立即重新本地化所有仍存活的已登记元素（由语言切换自动触发，也可手动调用） */
export const refreshLocalized = (): void => {
    for (let i = registrations.length - 1; i >= 0; i--) {
        if (!applyRegistration(registrations[i])) {
            registrations.splice(i, 1)
        }
    }
    for (let i = applyRegistrations.length - 1; i >= 0; i--) {
        const el = applyRegistrations[i].ref.deref()
        if (el === undefined) {
            applyRegistrations.splice(i, 1)
            continue
        }
        applyRegistrations[i].apply(el)
    }
}

const register = (el: HTMLElement, set: ValueSetter, key: LocalKeyParam): void => {
    set(el, translate(key))
    registrations.push({ref: new WeakRef(el), set, key})
    compactRegistrations()
}

/** 设置 `textContent` 并登记，语言切换时自动重译 */
export const localizeText = (el: HTMLElement, key: LocalKeyParam): HTMLElement => {
    register(el, setTextContent, key)
    return el
}

/** 设置 `title` 并登记，语言切换时自动重译 */
export const localizeTitle = (el: HTMLElement, key: LocalKeyParam): HTMLElement => {
    register(el, setTitle, key)
    return el
}

/** 设置 `placeholder` 并登记，语言切换时自动重译（仅 input / textarea 生效） */
export const localizePlaceholder = (el: HTMLElement, key: LocalKeyParam): HTMLElement => {
    register(el, setPlaceholder, key)
    return el
}

/**
 * 在 `parent` 内追加一个本地化文本 `<span>` 并返回它。
 * 适用于**父元素还需承载子控件**（`select` / `input` 等）的场景：
 * 此时不能对父元素用 `localizeText`（刷新会 `textContent` 清空子控件），改用本函数只重译文本 span。
 */
export const appendLocalizedText = (parent: HTMLElement, key: LocalKeyParam): HTMLSpanElement => {
    const span = document.createElement('span')
    localizeText(span, key)
    parent.appendChild(span)
    return span
}

/**
 * 登记一个**计算型本地化**：立即执行 `apply(el)` 并在语言切换时重新执行。
 * 用于无法用单个文案键表达的 UI——如 `select` 的 `<option>`（含插值数值的武器 / 护甲名）、
 * `optgroup.label`、属性预览文本等。`apply` 内应基于当前语言重新计算结果并写回元素。
 */
export const localizeApply = (el: HTMLElement, apply: (el: HTMLElement) => void): HTMLElement => {
    apply(el)
    applyRegistrations.push({ref: new WeakRef(el), apply})
    compactRegistrations()
    return el
}

/* 模块加载即订阅：语言切换时原地刷新所有登记元素 */
onLocaleChange(refreshLocalized)
