import type {InputAction, InputRegistry, KeyCombo, BindingsMap} from './types.ts'
import {INPUT_ACTIONS} from './types.ts'
import {DEFAULT_BINDINGS, STORAGE_KEY} from './constants.ts'
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

class InputRegistryImpl implements InputRegistry {
    private activeKeys = new Set<string>()
    private pressedThisFrame = new Set<string>()
    private lastWinningActions = new Set<InputAction>()
    private callbacks = new Map<InputAction, Set<() => void>>()
    private bindings: BindingsMap
    private keyCapture: ((combo: KeyCombo) => void) | undefined
    private captureMax: KeyCombo | undefined
    private destroyed = false

    private onKeyDownBound: (e: KeyboardEvent) => void
    private onKeyUpBound: (e: KeyboardEvent) => void
    private onBlurBound: () => void

    constructor() {
        this.bindings = this.loadFromStorageInternal() ?? this.cloneDefaults()

        for (const action of INPUT_ACTIONS) {
            this.callbacks.set(action, new Set())
        }

        this.onKeyDownBound = (e) => this.handleKeyDown(e)
        this.onKeyUpBound = (e) => this.handleKeyUp(e)
        this.onBlurBound = () => this.handleBlur()

        window.addEventListener('keydown', this.onKeyDownBound)
        window.addEventListener('keyup', this.onKeyUpBound)
        window.addEventListener('blur', this.onBlurBound)
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

    readonly setKeyCapture = (handler: ((combo: KeyCombo) => void) | undefined): void => {
        this.keyCapture = handler
        this.captureMax = undefined
        if (handler) {
            this.activeKeys.clear()
            this.lastWinningActions.clear()
        }
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
        this.activeKeys.clear()
        this.pressedThisFrame.clear()
        this.lastWinningActions.clear()
        this.callbacks.clear()
        this.keyCapture = undefined
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
            /* 基础校验：确保所有动作都有对应的数组 */
            const obj = parsed as Record<string, unknown>
            for (const action of INPUT_ACTIONS) {
                if (!Array.isArray(obj[action])) return undefined
                const combos = obj[action] as unknown[]
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

        /* 捕获模式 */
        if (this.keyCapture) {
            e.preventDefault()
            /* Esc 取消捕获 */
            if (e.code === 'Escape') {
                this.keyCapture = undefined
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

        /* 忽略捕获中仍触发的 keydown（安全保护） */
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

        if (this.keyCapture) {
            this.activeKeys.delete(e.code)
            /* 所有键释放且有有效最大组合 → 确认 */
            if (this.activeKeys.size === 0 && this.captureMax && this.captureMax.length > 0) {
                const handler = this.keyCapture
                this.keyCapture = undefined
                const combo = this.captureMax
                this.captureMax = undefined
                handler(combo)
            }
            return
        }

        this.activeKeys.delete(e.code)
        this.lastWinningActions = this.computeWinningActions()
    }

    private handleBlur(): void {
        this.activeKeys.clear()
        this.lastWinningActions.clear()
        /* 捕获模式的 handler 不触发 — 失去焦点应取消 */
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
