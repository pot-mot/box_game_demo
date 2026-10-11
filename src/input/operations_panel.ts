import {getInputRegistry} from './registry.ts'
import type {InputAction, KeyCombo, BindingsMap, FixedMouseOperation, MouseOperationsMode} from './types.ts'
import {INPUT_ACTIONS, ACTION_LABELS, ACTION_GROUPS, MOUSE_ACTIONS_BY_MODE, FIXED_MOUSE_OPERATIONS} from './types.ts'
import {DEFAULT_BINDINGS, findConflicts} from './constants.ts'
import {keyComboToDisplay} from './display.ts'
import type {DeepReadonly} from '../types/readonly.ts'
import {translate, type LocalKeyParam} from '../i18n/index.ts'
import {localizeText, localizeTitle} from '../i18n/dom.ts'
import {createIcon} from '../ui/icons/icon.ts'

/** 注入面板自管样式 */
const injectStyles = (): void => {
    if (document.querySelector('#bp-styles')) return
    const style = document.createElement('style')
    style.id = 'bp-styles'
    style.textContent = `
.bp-overlay { position:fixed; inset:0; z-index:998; background:var(--dc-overlay); display:flex; align-items:center; justify-content:center; }
.bp-panel { background:var(--dc-bg-2); border:1px solid var(--dc-border); border-radius:var(--dc-radius-lg); box-shadow:var(--dc-shadow-panel), inset 0 0 0 1px var(--dc-hairline); width:480px; max-height:80vh; display:flex; flex-direction:column; overflow:hidden; }
.bp-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--dc-border); }
.bp-title { font-family:var(--dc-font-display); font-size:var(--dc-fs-16); font-weight:700; color:var(--dc-gold); letter-spacing:1px; }
.bp-close-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; background:none; border:none; color:var(--dc-text-dim); cursor:pointer; }
.bp-close-btn:hover { color:var(--dc-gold); }
.bp-content { flex:1; overflow-y:auto; scrollbar-gutter:stable; padding:8px 20px 16px; }
.bp-group-title { font-size:var(--dc-fs-11); line-height:1.8; font-weight:700; color:var(--dc-text-mute); text-transform:uppercase; letter-spacing:1px; padding:12px 0 4px; border-bottom:1px solid var(--dc-border); margin-bottom:4px; }
.bp-group-title:first-child { padding-top:4px; }
.bp-row { display:flex; align-items:center; gap:6px; padding:6px 0; }
.bp-row-label { flex:1; font-size:var(--dc-fs-13); color:var(--dc-text); }
.bp-row-key { display:inline-block; font-family:var(--dc-font-mono); font-size:var(--dc-fs-12); background:var(--dc-bg-3); color:var(--dc-text-dim); padding:2px 8px; border-radius:var(--dc-radius-sm); border:1px solid var(--dc-border); min-width:60px; text-align:center; }
.bp-row-key-fixed { background:var(--dc-bg-1); color:var(--dc-text-mute); border-color:var(--dc-border); }
.bp-row-key-capturing { background:var(--dc-bg-3); border-color:var(--dc-orange); color:var(--dc-gold-bright); animation:bp-pulse .8s ease-in-out infinite alternate; }
@keyframes bp-pulse { from{opacity:.7} to{opacity:1} }
.bp-row-btn { display:inline-flex; align-items:center; justify-content:center; background:var(--dc-bg-3); border:1px solid var(--dc-border); color:var(--dc-text-dim); cursor:pointer; padding:2px 6px; border-radius:var(--dc-radius-sm); min-width:22px; min-height:22px; }
.bp-row-btn:hover { background:var(--dc-bg-2); border-color:var(--dc-border-strong); color:var(--dc-gold); }
.bp-row-btn:disabled { cursor:default; color:var(--dc-text-disabled); }
.bp-row-btn-del { color:var(--dc-danger); border-color:var(--dc-border); }
.bp-row-btn-del:hover { background:var(--dc-bg-2); border-color:var(--dc-danger); }
.bp-row-hint { font-size:var(--dc-fs-11); color:var(--dc-text-mute); }
.bp-footer { display:flex; gap:8px; padding:12px 20px; border-top:1px solid var(--dc-border); justify-content:flex-end; }
.bp-btn { padding:8px 16px; font-size:var(--dc-fs-13); border:1px solid var(--dc-border); background:var(--dc-bg-3); color:var(--dc-text); cursor:pointer; border-radius:var(--dc-radius); transition:background var(--dc-transition), border-color var(--dc-transition), color var(--dc-transition); }
.bp-btn:hover { background:var(--dc-bg-2); border-color:var(--dc-border-strong); color:var(--dc-text); }
.bp-conflict-overlay { position:fixed; inset:0; z-index:9999; background:var(--dc-overlay); display:flex; align-items:center; justify-content:center; }
.bp-conflict-box { background:var(--dc-bg-2); border:1px solid var(--dc-border-strong); border-radius:var(--dc-radius); box-shadow:var(--dc-shadow-panel); padding:24px 32px; min-width:360px; text-align:center; }
.bp-conflict-title { font-family:var(--dc-font-display); font-size:var(--dc-fs-16); font-weight:700; color:var(--dc-warning); margin-bottom:12px; }
.bp-conflict-msg { font-size:var(--dc-fs-14); color:var(--dc-text-dim); margin-bottom:20px; }
.bp-conflict-actions { display:flex; gap:12px; justify-content:center; }
.bp-btn-cancel { background:var(--dc-bg-3); border-color:var(--dc-border); color:var(--dc-text-mute); }
.bp-btn-confirm { background:var(--dc-red); border-color:var(--dc-red-bright); color:var(--dc-text); }
.bp-toast { position:fixed; bottom:40px; left:50%; transform:translateX(-50%); z-index:9999; background:var(--dc-bg-2); border:1px solid var(--dc-border); color:var(--dc-text); font-size:var(--dc-fs-14); padding:10px 24px; border-radius:var(--dc-radius); pointer-events:none; animation:bp-fade-in .2s ease-out; }
@keyframes bp-fade-in { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
`
    document.head.appendChild(style)
}

/** 从 DeepReadonly 深拷贝为可变 BindingsMap */
const cloneBindings = (src: DeepReadonly<BindingsMap>): BindingsMap => {
    const copy = {} as BindingsMap
    for (const action of INPUT_ACTIONS) {
        copy[action] = src[action].map(c => [...c])
    }
    return copy
}

const createConflictDialog = (message: string): { el: HTMLElement; confirm: Promise<boolean> } => {
    const overlay = document.createElement('div')
    overlay.className = 'bp-conflict-overlay'

    const box = document.createElement('div')
    box.className = 'bp-conflict-box'
    box.innerHTML = ''
    overlay.appendChild(box)

    const title = document.createElement('div')
    title.className = 'bp-conflict-title'
    localizeText(title, 'input.conflict_title')
    box.appendChild(title)

    const msg = document.createElement('div')
    msg.className = 'bp-conflict-msg'
    msg.textContent = message
    box.appendChild(msg)

    const actions = document.createElement('div')
    actions.className = 'bp-conflict-actions'
    box.appendChild(actions)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'bp-btn bp-btn-cancel'
    localizeText(cancelBtn, 'common.cancel')
    actions.appendChild(cancelBtn)

    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'bp-btn bp-btn-confirm'
    localizeText(confirmBtn, 'common.overwrite')
    actions.appendChild(confirmBtn)

    document.body.appendChild(overlay)

    const promise = new Promise<boolean>((resolve) => {
        confirmBtn.addEventListener('click', () => {
            overlay.remove()
            resolve(true)
        })
        cancelBtn.addEventListener('click', () => {
            overlay.remove()
            resolve(false)
        })
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove()
                resolve(false)
            }
        })
    })

    return {el: overlay, confirm: promise}
}

/**
 * 创建并打开操作设置面板（键盘 + 鼠标）。
 * @param mode 当前模式，决定“不可修改”的鼠标操作清单
 */
export const openOperationsPanel = (mode: MouseOperationsMode): void => {
    injectStyles()
    const input = getInputRegistry()

    /* 面板内部追踪捕获状态，用于 Esc 区分关闭面板 / 取消捕获 */
    let isCapturing = false

    /* 背景遮罩 */
    const overlay = document.createElement('div')
    overlay.className = 'bp-overlay'
    document.body.appendChild(overlay)

    /* 面板容器 */
    const panel = document.createElement('div')
    panel.className = 'bp-panel'
    overlay.appendChild(panel)

    /* 标题栏 */
    const header = document.createElement('div')
    header.className = 'bp-header'
    panel.appendChild(header)

    const title = document.createElement('span')
    title.className = 'bp-title'
    localizeText(title, 'input.operations_title')
    header.appendChild(title)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'bp-close-btn'
    closeBtn.appendChild(createIcon('close'))
    closeBtn.addEventListener('click', () => overlay.remove())
    header.appendChild(closeBtn)

    /* 内容滚动区 */
    const content = document.createElement('div')
    content.className = 'bp-content'
    panel.appendChild(content)

    /* ---- 底栏按钮 ---- */
    const footer = document.createElement('div')
    footer.className = 'bp-footer'
    panel.appendChild(footer)

    const resetBtn = document.createElement('button')
    resetBtn.className = 'bp-btn'
    localizeText(resetBtn, 'input.reset_defaults')
    footer.appendChild(resetBtn)

    const importBtn = document.createElement('button')
    importBtn.className = 'bp-btn'
    localizeText(importBtn, 'input.import_config')
    footer.appendChild(importBtn)

    const exportBtn = document.createElement('button')
    exportBtn.className = 'bp-btn'
    localizeText(exportBtn, 'input.export_config')
    footer.appendChild(exportBtn)

    /* ---- 构建行 ---- */

    /** 可修改的动作行：每项绑定一个键位标签 + 替换/删除，行尾追加“添加替代绑定” */
    const createActionRow = (action: InputAction, combos: DeepReadonly<KeyCombo[]>): HTMLElement => {
        const row = document.createElement('div')
        row.className = 'bp-row'

        const label = document.createElement('span')
        label.className = 'bp-row-label'
        localizeText(label, ACTION_LABELS[action])
        row.appendChild(label)

        for (let i = 0; i < combos.length; i++) {
            const combo = combos[i]

            const keyChip = document.createElement('span')
            keyChip.className = 'bp-row-key'
            keyChip.textContent = keyComboToDisplay(combo)
            row.appendChild(keyChip)

            /* 编辑按钮 */
            const editBtn = document.createElement('button')
            editBtn.className = 'bp-row-btn bp-row-btn-edit'
            editBtn.appendChild(createIcon('pencil', {size: 'sm'}))
            localizeTitle(editBtn, 'input.replace_binding')
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                startCapture(action, i, row)
            })
            row.appendChild(editBtn)

            /* 删除按钮 */
            const delBtn = document.createElement('button')
            delBtn.className = 'bp-row-btn bp-row-btn-del'
            delBtn.appendChild(createIcon('close', {size: 'sm'}))
            localizeTitle(delBtn, 'input.delete_binding')
            if (combos.length <= 1) {
                delBtn.disabled = true
                delBtn.style.opacity = '0.3'
            }
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (combos.length > 1) {
                    const newBindings = cloneBindings(input.getBindings())
                    newBindings[action] = newBindings[action].filter((_, j) => j !== i)
                    input.setBindings(newBindings)
                    input.saveToStorage()
                    buildContent()
                }
            })
            row.appendChild(delBtn)
        }

        /* 添加替代绑定按钮 */
        if (combos.length === 0 || combos.length < 3) {
            const addBtn = document.createElement('button')
            addBtn.className = 'bp-row-btn bp-row-btn-add'
            addBtn.appendChild(createIcon('plus', {size: 'sm'}))
            localizeTitle(addBtn, 'input.add_alt_binding')
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                startCapture(action, undefined, row)
            })
            row.appendChild(addBtn)
        }

        return row
    }

    /** 不可修改的鼠标操作行：仅展示，无编辑入口 */
    const createFixedRow = (op: FixedMouseOperation): HTMLElement => {
        const row = document.createElement('div')
        row.className = 'bp-row'

        const label = document.createElement('span')
        label.className = 'bp-row-label'
        localizeText(label, op.label)
        row.appendChild(label)

        const keyChip = document.createElement('span')
        keyChip.className = 'bp-row-key bp-row-key-fixed'
        localizeText(keyChip, op.keys)
        row.appendChild(keyChip)

        const hint = document.createElement('span')
        hint.className = 'bp-row-hint'
        localizeText(hint, 'input.fixed')
        row.appendChild(hint)

        return row
    }

    const appendGroupTitle = (name: LocalKeyParam): void => {
        const groupTitle = document.createElement('div')
        groupTitle.className = 'bp-group-title'
        localizeText(groupTitle, name)
        content.appendChild(groupTitle)
    }

    const buildContent = (): void => {
        content.innerHTML = ''
        const currentBindings = input.getBindings()

        /* —— 鼠标：当前模式下可修改的指针动作 + 不可修改的鼠标操作 —— */
        appendGroupTitle('input.mouse_group')
        for (const action of MOUSE_ACTIONS_BY_MODE[mode]) {
            content.appendChild(createActionRow(action, currentBindings[action]))
        }
        for (const op of FIXED_MOUSE_OPERATIONS[mode]) {
            content.appendChild(createFixedRow(op))
        }

        /* —— 键盘 —— */
        for (const group of ACTION_GROUPS) {
            appendGroupTitle(group.name)
            for (const action of group.actions) {
                content.appendChild(createActionRow(action, currentBindings[action]))
            }
        }
    }

    buildContent()

    /* ---- 输入捕获（键盘按键或鼠标按键） ---- */

    const startCapture = (action: InputAction, index: number | undefined, row: HTMLElement): void => {
        isCapturing = true
        /* 标记捕获行 */
        const capturingChip = document.createElement('span')
        capturingChip.className = 'bp-row-key bp-row-key-capturing'
        localizeText(capturingChip, 'input.capture_prompt')
        row.appendChild(capturingChip)
        row.classList.add('bp-row-capturing')

        input.setInputCapture((combo: KeyCombo) => {
            /* 捕获完成 */
            isCapturing = false
            row.classList.remove('bp-row-capturing')
            capturingChip.remove()

            const currentBindings = cloneBindings(input.getBindings())
            const actionCombos = currentBindings[action]

            /* 检查是否与当前动作的其他绑定重复 */
            const dupInSame = actionCombos.some((existing, existingIdx) => {
                if (existingIdx === index) return false
                return existing.length === combo.length && existing.every((c, ci) => c === combo[ci])
            })
            if (dupInSame) {
                buildContent()
                return
            }

            /* 冲突检查（可能同时与多个动作冲突：不同模式的鼠标动作默认共用同一按键） */
            const conflictActions = findConflicts(currentBindings, combo, action)

            const applyBinding = (): void => {
                /* 从所有冲突动作中移除此绑定 */
                for (const conflictAction of conflictActions) {
                    currentBindings[conflictAction] = currentBindings[conflictAction].filter(
                        existing => !(existing.length === combo.length && existing.every((c, ci) => c === combo[ci]))
                    )
                }

                if (index !== undefined) {
                    /* 替换模式 */
                    currentBindings[action][index] = combo
                } else {
                    /* 添加模式 */
                    currentBindings[action].push(combo)
                }

                input.setBindings(currentBindings)
                input.saveToStorage()
                buildContent()
            }

            if (conflictActions.length > 0) {
                const names = conflictActions.map(a => `「${translate(ACTION_LABELS[a])}」`).join('、')
                createConflictDialog(translate({key: 'input.conflict_message', args: [names]})).confirm.then((confirmed: boolean) => {
                    if (confirmed) applyBinding()
                    else buildContent()
                })
            } else {
                applyBinding()
            }
        })
    }

    /* ---- 底栏按钮事件 ---- */

    resetBtn.addEventListener('click', () => {
        input.resetToDefaults()
        buildContent()
    })

    exportBtn.addEventListener('click', () => {
        const data = JSON.stringify(input.getBindings(), null, 2)
        const blob = new Blob([data], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'box_demo_keybindings.json'
        a.click()
        URL.revokeObjectURL(url)
    })

    importBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = '.json'
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    const raw = reader.result as string
                    const parsed = JSON.parse(raw) as unknown
                    if (parsed === null || typeof parsed !== 'object') {
                        showToast(translate('input.toast.invalid_root'))
                        return
                    }
                    const obj = parsed as Record<string, unknown>
                    /* 旧版本导出的文件可能缺少后新增的动作：用默认绑定补齐，不整体拒绝 */
                    for (const action of INPUT_ACTIONS) {
                        if (obj[action] === undefined) {
                            obj[action] = DEFAULT_BINDINGS[action].map(combo => [...combo])
                        }
                    }
                    for (const action of INPUT_ACTIONS) {
                        if (!Array.isArray(obj[action])) {
                            showToast(translate({key: 'input.toast.missing_action', args: [action]}))
                            return
                        }
                        const combos = obj[action] as unknown[]
                        if (combos.length === 0) {
                            showToast(translate({key: 'input.toast.no_binding', args: [translate(ACTION_LABELS[action])]}))
                            return
                        }
                        for (const combo of combos) {
                            if (!Array.isArray(combo) || combo.some((c: unknown) => typeof c !== 'string')) {
                                showToast(translate({key: 'input.toast.bad_combo', args: [translate(ACTION_LABELS[action])]}))
                                return
                            }
                        }
                    }
                    const bindings = obj as unknown as BindingsMap
                    input.setBindings(bindings)
                    input.saveToStorage()
                    buildContent()
                    showToast(translate('input.toast.import_success'))
                } catch {
                    showToast(translate('input.toast.parse_error'))
                }
            }
            reader.readAsText(file)
        })
        fileInput.click()
    })

    /* 点击遮罩关闭 */
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove()
        }
    })

    /* Esc 关闭 */
    const escHandler = (e: KeyboardEvent): void => {
        if (e.code === 'Escape') {
            if (isCapturing) {
                isCapturing = false
                input.setInputCapture(undefined)
                buildContent()
            } else {
                overlay.remove()
                window.removeEventListener('keydown', escHandler)
            }
        }
    }
    window.addEventListener('keydown', escHandler)

    /* 面板关闭时确保停止捕获 */
    const observer = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            input.setInputCapture(undefined)
            observer.disconnect()
            window.removeEventListener('keydown', escHandler)
        }
    })
    observer.observe(document.body, {childList: true})
}

/** 在面板内显示短暂提示 */
const showToast = (msg: string): void => {
    const toast = document.createElement('div')
    toast.className = 'bp-toast'
    toast.textContent = msg
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
}
