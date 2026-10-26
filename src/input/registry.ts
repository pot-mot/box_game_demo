import type {InputAction, InputRegistry, KeyCombo, BindingsMap} from './types.ts'
import {INPUT_ACTIONS} from './types.ts'
import {DEFAULT_BINDINGS, STORAGE_KEY, mouseCode} from './constants.ts'
import type {DeepReadonly} from '../types/readonly.ts'

/** 将 combo 规范化为排序后的不可变数组 */
const normalize = (codes: ReadonlySet<string>): KeyCombo => {
    return [...codes].sort()
}

/** combo 是否为另一个 combo 的真子集 */
const isStrictSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
    if (a.size >= b.size) return false
    for (const code of a) {
        if (!b.has(code)) return false
    }
    return true
}

/**
 * 焦点是否位于可交互控件（表单 / 按钮 / 链接 / 可编辑区）。
 * 游戏画面内（焦点落在 body）按 Tab 不得切换浏览器焦点，故需拦截默认行为；
 * 设置面板等控件内则保留 Tab 的默认焦点导航。
 */
export const isFocusInteractive = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    switch (target.tagName) {
        case 'INPUT':
        case 'TEXTAREA':
        case 'SELECT':
        case 'BUTTON':
        case 'A':
            return true
        default:
            return false
    }
}

/**
 * 焦点是否位于会消费字符 / 方向键的输入控件（输入框 / 文本域 / 下拉 / 可编辑区）。
 * 这类控件获得焦点时游戏输入完全让位，键盘事件只交给控件自身处理。
 * 按钮 / 链接不消费字母与方向键，只在激活键（空格 / 回车）上让位，避免破坏点击按钮后的 WASD 操作。
 */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    switch (target.tagName) {
        case 'INPUT':
        case 'TEXTAREA':
        case 'SELECT':
            return true
        default:
            return false
    }
}

class InputRegistryImpl implements InputRegistry {
    private activeKeys = new Set<string>()
    private pressedThisFrame = new Set<string>()
    private lastWinningActions = new Set<InputAction>()
    private callbacks = new Map<InputAction, Set<() => void>>()
    private bindings: BindingsMap
    private inputCapture: ((combo: KeyCombo) => void) | undefined
    private captureMax: KeyCombo | undefined
    /** 鼠标捕获刚结束：吞掉紧随其后的 click / contextmenu（下一次 mousedown 自动解除） */
    private swallowNextClick = false
    private destroyed = false

    private onKeyDownBound: (e: KeyboardEvent) => void
    private onKeyUpBound: (e: KeyboardEvent) => void
    private onBlurBound: () => void
    private onFocusInBound: (e: FocusEvent) => void
    private onVisibilityChangeBound: () => void
    private onMouseDownBound: (e: MouseEvent) => void
    private onMouseUpBound: (e: MouseEvent) => void
    private onClickBound: (e: MouseEvent) => void
    private onContextMenuBound: (e: MouseEvent) => void

    constructor() {
        this.bindings = this.loadFromStorageInternal() ?? this.cloneDefaults()

        for (const action of INPUT_ACTIONS) {
            this.callbacks.set(action, new Set())
        }

        this.onKeyDownBound = (e) => this.handleKeyDown(e)
        this.onKeyUpBound = (e) => this.handleKeyUp(e)
        this.onBlurBound = () => this.handleBlur()
        this.onFocusInBound = (e) => this.handleFocusIn(e)
        this.onVisibilityChangeBound = () => this.handleVisibilityChange()
        this.onMouseDownBound = (e) => this.handleMouseDown(e)
        this.onMouseUpBound = (e) => this.handleMouseUp(e)
        this.onClickBound = (e) => this.handleSuppressedMouseEvent(e)
        this.onContextMenuBound = (e) => this.handleSuppressedMouseEvent(e)

        window.addEventListener('keydown', this.onKeyDownBound)
        window.addEventListener('keyup', this.onKeyUpBound)
        window.addEventListener('blur', this.onBlurBound)
        /* 焦点进入输入框 / select 等交互控件时立即清空按键：
         * 原生下拉在部分浏览器会吞掉 keyup，若不清空会让相机 / 角色持续运动 */
        document.addEventListener('focusin', this.onFocusInBound)
        /* 切后台 / 最小化同样视为一次输入状态复位 */
        document.addEventListener('visibilitychange', this.onVisibilityChangeBound)
        /* 鼠标捕获走捕获阶段：stopPropagation 可拦住画布/窗口上的相机、拾取等监听 */
        window.addEventListener('mousedown', this.onMouseDownBound, {capture: true})
        window.addEventListener('mouseup', this.onMouseUpBound, {capture: true})
        window.addEventListener('click', this.onClickBound, {capture: true})
        window.addEventListener('contextmenu', this.onContextMenuBound, {capture: true})
    }

    /* ── 公开 API ── */

    readonly isActionActive = (action: InputAction): boolean => {
        return this.computeWinningActions().has(action)
    }

    readonly wasActionPressed = (action: InputAction): boolean => {
        const combos = this.bindings[action]
        for (const combo of combos) {
            if (combo.length === 0) continue
            const allActive = combo.every(c => this.activeKeys.has(c))
            const anyNewThisFrame = combo.some(c => this.pressedThisFrame.has(c))
            if (allActive && anyNewThisFrame) {
                return true
            }
        }
        return false
    }

    readonly onActionDown = (action: InputAction, callback: () => void): void => {
        const set = this.callbacks.get(action)
        set?.add(callback)
    }

    readonly setInputCapture = (handler: ((combo: KeyCombo) => void) | undefined): void => {
        this.inputCapture = handler
        this.captureMax = undefined
        /* 进入 / 退出捕获都复位按住状态：避免捕获期间或原生控件吞键后残留移动键 */
        this.activeKeys.clear()
        this.pressedThisFrame.clear()
        this.lastWinningActions.clear()
    }

    readonly matchesMouseButton = (action: InputAction, button: number): boolean => {
        const code = mouseCode(button)
        for (const combo of this.bindings[action]) {
            if (!combo.includes(code)) continue
            /* 组合中的其它键（修饰键等）必须处于按下状态 */
            if (combo.every(c => c === code || this.activeKeys.has(c))) return true
        }
        return false
    }

    /** 该动作在当前修饰键状态下匹配某鼠标按键码的最长组合长度（无匹配为 0） */
    private maxMatchingComboLength = (action: InputAction, code: string): number => {
        let max = 0
        for (const combo of this.bindings[action]) {
            if (!combo.includes(code)) continue
            /* 组合中的其它键（修饰键等）必须处于按下状态 */
            if (!combo.every(c => c === code || this.activeKeys.has(c))) continue
            if (combo.length > max) max = combo.length
        }
        return max
    }

    readonly isMouseButtonOverridden = (
        button: number,
        actions: readonly InputAction[],
        baseAction?: InputAction,
    ): boolean => {
        const code = mouseCode(button)
        const base = baseAction === undefined ? 1 : this.maxMatchingComboLength(baseAction, code)
        for (const action of actions) {
            if (action === baseAction) continue
            if (this.maxMatchingComboLength(action, code) > base) return true
        }
        return false
    }

    readonly getBindings = (): DeepReadonly<BindingsMap> => this.bindings

    readonly setBindings = (map: BindingsMap): void => {
        this.bindings = map
    }

    readonly resetToDefaults = (): void => {
        this.bindings = this.cloneDefaults()
        this.saveToStorage()
    }

    readonly saveToStorage = (): void => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings))
        } catch {
            /* 静默 */
        }
    }

    readonly loadFromStorage = (): void => {
        const loaded = this.loadFromStorageInternal()
        if (loaded) {
            this.bindings = loaded
        }
    }

    readonly getUpdater = (): (() => void) => {
        return () => {
            this.lastWinningActions = this.computeWinningActions()
            this.pressedThisFrame.clear()
        }
    }

    readonly destroy = (): void => {
        this.destroyed = true
        window.removeEventListener('keydown', this.onKeyDownBound)
        window.removeEventListener('keyup', this.onKeyUpBound)
        window.removeEventListener('blur', this.onBlurBound)
        document.removeEventListener('focusin', this.onFocusInBound)
        document.removeEventListener('visibilitychange', this.onVisibilityChangeBound)
        window.removeEventListener('mousedown', this.onMouseDownBound, {capture: true})
        window.removeEventListener('mouseup', this.onMouseUpBound, {capture: true})
        window.removeEventListener('click', this.onClickBound, {capture: true})
        window.removeEventListener('contextmenu', this.onContextMenuBound, {capture: true})
        this.activeKeys.clear()
        this.pressedThisFrame.clear()
        this.lastWinningActions.clear()
        this.callbacks.clear()
        this.inputCapture = undefined
        this.swallowNextClick = false
    }

    /* ── 内部方法 ── */

    private cloneDefaults(): BindingsMap {
        /* 深拷贝默认绑定 */
        const copy = {} as BindingsMap
        for (const action of INPUT_ACTIONS) {
            copy[action] = DEFAULT_BINDINGS[action].map(c => [...c] as KeyCombo)
        }
        return copy
    }

    private loadFromStorageInternal(): BindingsMap | undefined {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (!raw) return undefined
            const parsed = JSON.parse(raw) as unknown
            if (parsed === null || typeof parsed !== 'object') return undefined
            /* 基础校验；旧版本记录缺少后新增的动作时用默认绑定补齐，避免整体回退丢失用户配置 */
            const obj = parsed as Record<string, unknown>
            for (const action of INPUT_ACTIONS) {
                const value = obj[action]
                if (value === undefined) {
                    obj[action] = DEFAULT_BINDINGS[action].map(combo => [...combo])
                    continue
                }
                if (!Array.isArray(value)) return undefined
                const combos: unknown[] = value
                for (const combo of combos) {
                    if (!Array.isArray(combo)) return undefined
                    if (combo.some((c: unknown) => typeof c !== 'string')) return undefined
                }
            }
            return obj as unknown as BindingsMap
        } catch {
            return undefined
        }
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (this.destroyed) return

        /* 输入法组合期间不处理游戏输入（中文输入时字母键只作用于输入法） */
        if (e.isComposing) return

        /* 捕获模式 */
        if (this.inputCapture) {
            e.preventDefault()
            /* Esc 取消捕获 */
            if (e.code === 'Escape') {
                this.inputCapture = undefined
                this.captureMax = undefined
                this.activeKeys.clear()
                return
            }
            /* 忽略 Tab（捕获中不应切换焦点） */
            if (e.code === 'Tab') {
                e.preventDefault()
                return
            }
            this.activeKeys.add(e.code)
            const combo = normalize(this.activeKeys)
            if (!this.captureMax || combo.length >= this.captureMax.length) {
                this.captureMax = combo
            }
            return
        }

        /* Tab：游戏画面内拦截浏览器默认焦点切换（避免焦点跳到面板按钮后空格 / 回车误触），
         * 可交互控件（输入框 / 下拉 / 按钮）内的 Tab 保留默认导航 */
        if (e.code === 'Tab' && !isFocusInteractive(e.target)) {
            e.preventDefault()
        }

        /* 焦点在输入控件内：键盘事件只交给控件自身处理（输入框 / 文本域 / select / 可编辑区），
         * 不进入游戏动作、不阻止默认行为。Escape 例外：保留关闭面板的全局退路。 */
        if (isTextEntryTarget(e.target) && e.code !== 'Escape') return

        /* 按钮 / 链接的激活键让位给原生行为，避免空格同时触发跳跃 */
        if (isFocusInteractive(e.target) && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) return

        /* 更新 activeKeys */
        this.activeKeys.add(e.code)
        this.pressedThisFrame.add(e.code)

        /* 计算新获胜动作 */
        const newWinning = this.computeWinningActions()

        /* 有匹配的动作 → 阻止浏览器默认行为 */
        if (newWinning.size > 0) {
            e.preventDefault()
        }

        /* 触发从非获胜变为获胜的动作回调 */
        for (const action of newWinning) {
            if (!this.lastWinningActions.has(action)) {
                const cbs = this.callbacks.get(action)
                if (cbs) {
                    for (const cb of cbs) {
                        try { cb() } catch { /* 回调异常不抛给调用方 */ }
                    }
                }
            }
        }

        this.lastWinningActions = newWinning
    }

    private handleKeyUp(e: KeyboardEvent): void {
        if (this.destroyed) return

        if (this.inputCapture) {
            this.activeKeys.delete(e.code)
            /* 所有键释放且有有效最大组合 → 确认 */
            if (this.activeKeys.size === 0 && this.captureMax && this.captureMax.length > 0) {
                this.finishCapture()
            }
            return
        }

        this.activeKeys.delete(e.code)
        this.lastWinningActions = this.computeWinningActions()
    }

    /** 鼠标按下：捕获模式下记录按键码，并拦住画布上的相机/拾取监听 */
    private handleMouseDown(e: MouseEvent): void {
        if (this.destroyed) return
        /* 新的按下意味着上一次交互已结束，解除一次性吞掉标记 */
        this.swallowNextClick = false
        if (!this.inputCapture) return
        e.preventDefault()
        e.stopPropagation()
        this.activeKeys.add(mouseCode(e.button))
        const combo = normalize(this.activeKeys)
        if (!this.captureMax || combo.length >= this.captureMax.length) {
            this.captureMax = combo
        }
    }

    /** 鼠标抬起：全部按键释放后确认捕获结果 */
    private handleMouseUp(e: MouseEvent): void {
        if (this.destroyed) return
        if (!this.inputCapture) return
        e.preventDefault()
        e.stopPropagation()
        this.activeKeys.delete(mouseCode(e.button))
        if (this.activeKeys.size > 0) return
        if (!this.captureMax || this.captureMax.length === 0) return
        this.swallowNextClick = true
        this.finishCapture()
    }

    /** 捕获中或捕获刚结束：吞掉 click / contextmenu，避免误触关闭面板或弹出右键菜单 */
    private handleSuppressedMouseEvent(e: MouseEvent): void {
        if (this.destroyed) return
        if (this.inputCapture || this.swallowNextClick) {
            e.preventDefault()
            e.stopPropagation()
            this.swallowNextClick = false
        }
    }

    /** 结束捕获并把最终组合交给面板 */
    private finishCapture(): void {
        const handler = this.inputCapture
        const combo = this.captureMax
        this.inputCapture = undefined
        this.captureMax = undefined
        if (handler && combo) handler(combo)
    }

    private handleBlur(): void {
        this.activeKeys.clear()
        this.pressedThisFrame.clear()
        this.lastWinningActions.clear()
        /* 捕获模式的 handler 不触发 — 失去焦点应取消 */
    }

    /** 焦点进入输入控件：清空按住状态，避免原生控件吞掉 keyup 后相机 / 角色持续运动 */
    private handleFocusIn(e: FocusEvent): void {
        if (this.destroyed) return
        /* 捕获键盘绑定时不打断（此时按键属于绑定输入，不属于游戏控制） */
        if (this.inputCapture) return
        if (!isTextEntryTarget(e.target)) return
        this.handleBlur()
    }

    /** 页面切到后台 / 最小化：清空按键，避免回来后残留按住状态 */
    private handleVisibilityChange(): void {
        if (this.destroyed) return
        if (document.visibilityState === 'hidden') this.handleBlur()
    }

    /** 根据最长匹配规则计算当前获胜的动作集合 */
    private computeWinningActions(): Set<InputAction> {
        /* 收集所有被满足的 (combo keyset, action, combo) */
        const satisfied: { keyset: ReadonlySet<string>; action: InputAction }[] = []
        for (const action of INPUT_ACTIONS) {
            const combos = this.bindings[action]
            for (const combo of combos) {
                if (combo.length === 0) continue
                const allHeld = combo.every(c => this.activeKeys.has(c))
                if (allHeld) {
                    satisfied.push({keyset: new Set(combo), action})
                }
            }
        }

        /* 过滤：移除被更长 combo 遮蔽的（真子集关系） */
        const winning = new Set<InputAction>()
        for (const entry of satisfied) {
            const shadowed = satisfied.some(
                other => other !== entry && isStrictSubset(entry.keyset, other.keyset),
            )
            if (!shadowed) {
                winning.add(entry.action)
            }
        }

        return winning
    }
}

let instance: InputRegistryImpl | undefined

export const createInputRegistry = (): InputRegistry => {
    if (instance) {
        instance.destroy()
    }
    instance = new InputRegistryImpl()
    return instance
}

export const getInputRegistry = (): InputRegistry => {
    if (!instance) {
        throw new Error('输入注册表尚未初始化，请先调用 createInputRegistry()')
    }
    return instance
}
