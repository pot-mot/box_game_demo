import {getInputRegistry} from './registry.ts'
import type {InputAction, KeyCombo, BindingsMap} from './types.ts'
import {INPUT_ACTIONS, ACTION_LABELS, ACTION_GROUPS} from './types.ts'
import {findConflict} from './constants.ts'
import {keyComboToDisplay} from './display.ts'
import type {DeepReadonly} from '../types/readonly.ts'

/** 注入面板自管样式 */
const injectStyles = (): void => {
    if (document.querySelector('#bp-styles')) return
    const style = document.createElement('style')
    style.id = 'bp-styles'
    style.textContent = `
.bp-overlay { position:fixed; inset:0; z-index:998; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; }
.bp-panel { background:#1a1a1a; border:1px solid #444; width:480px; max-height:80vh; display:flex; flex-direction:column; overflow:hidden; }
.bp-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid #333; }
.bp-title { font:600 16px/1.5 system-ui,sans-serif; color:#fff; }
.bp-close-btn { background:none; border:none; color:#888; font-size:22px; cursor:pointer; line-height:1; }
.bp-close-btn:hover { color:#fff; }
.bp-content { flex:1; overflow-y:auto; padding:8px 20px 16px; }
.bp-group-title { font:11px/1.8 system-ui,sans-serif; font-weight:700; color:#666; text-transform:uppercase; letter-spacing:1px; padding:12px 0 4px; border-bottom:1px solid #2a2a2a; margin-bottom:4px; }
.bp-group-title:first-child { padding-top:4px; }
.bp-row { display:flex; align-items:center; gap:6px; padding:6px 0; }
.bp-row-label { flex:1; font:13px/1.5 system-ui,sans-serif; color:#ccc; }
.bp-row-key { display:inline-block; font:12px/1.4 'Courier New',monospace; background:#2a2a2a; color:#ddd; padding:2px 8px; border-radius:3px; border:1px solid #444; min-width:60px; text-align:center; }
.bp-row-key-capturing { background:#3a5a3a; border-color:#6a6; color:#9f9; animation:bp-pulse .8s ease-in-out infinite alternate; }
@keyframes bp-pulse { from{opacity:.7} to{opacity:1} }
.bp-row-btn { background:#333; border:1px solid #555; color:#aaa; font:11px/1 monospace; cursor:pointer; padding:2px 6px; border-radius:3px; min-width:22px; text-align:center; }
.bp-row-btn:hover { background:#444; color:#fff; }
.bp-row-btn:disabled { cursor:default; }
.bp-row-btn-del { color:#f66; border-color:#633; }
.bp-row-btn-del:hover { background:#533; }
.bp-footer { display:flex; gap:8px; padding:12px 20px; border-top:1px solid #333; justify-content:flex-end; }
.bp-btn { padding:8px 16px; font:13px/1.5 system-ui,sans-serif; border:1px solid #555; background:#2a2a2a; color:#ccc; cursor:pointer; }
.bp-btn:hover { background:#3a3a3a; color:#fff; }
.bp-conflict-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; }
.bp-conflict-box { background:#1a1a1a; border:1px solid #666; padding:24px 32px; min-width:360px; text-align:center; }
.bp-conflict-title { font:600 16px/1.5 system-ui,sans-serif; color:#fc6; margin-bottom:12px; }
.bp-conflict-msg { font:14px/1.6 system-ui,sans-serif; color:#ccc; margin-bottom:20px; }
.bp-conflict-actions { display:flex; gap:12px; justify-content:center; }
.bp-btn-cancel { background:#2a2a2a; border-color:#555; color:#999; }
.bp-btn-confirm { background:#5a1a1a; border-color:#a44; color:#faa; }
.bp-toast { position:fixed; bottom:40px; left:50%; transform:translateX(-50%); z-index:9999; background:#333; color:#fff; font:14px/1.5 system-ui,sans-serif; padding:10px 24px; border-radius:6px; pointer-events:none; animation:bp-fade-in .2s ease-out; }
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

const createConflictDialog = (conflictAction: InputAction): { el: HTMLElement; confirm: Promise<boolean> } => {
    const overlay = document.createElement('div')
    overlay.className = 'bp-conflict-overlay'

    const box = document.createElement('div')
    box.className = 'bp-conflict-box'
    box.innerHTML = ''
    overlay.appendChild(box)

    const title = document.createElement('div')
    title.className = 'bp-conflict-title'
    title.textContent = '按键冲突'
    box.appendChild(title)

    const msg = document.createElement('div')
    msg.className = 'bp-conflict-msg'
    msg.textContent = `此按键已被「${ACTION_LABELS[conflictAction]}」占用，是否覆盖原有绑定？`
    box.appendChild(msg)

    const actions = document.createElement('div')
    actions.className = 'bp-conflict-actions'
    box.appendChild(actions)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'bp-btn bp-btn-cancel'
    cancelBtn.textContent = '取消'
    actions.appendChild(cancelBtn)

    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'bp-btn bp-btn-confirm'
    confirmBtn.textContent = '覆盖'
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

/** 创建并打开按键配置面板 */
export const openBindingPanel = (): void => {
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
    title.textContent = '按键配置'
    header.appendChild(title)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'bp-close-btn'
    closeBtn.textContent = '×'
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
    resetBtn.textContent = '重置默认'
    footer.appendChild(resetBtn)

    const importBtn = document.createElement('button')
    importBtn.className = 'bp-btn'
    importBtn.textContent = '导入配置'
    footer.appendChild(importBtn)

    const exportBtn = document.createElement('button')
    exportBtn.className = 'bp-btn'
    exportBtn.textContent = '导出配置'
    footer.appendChild(exportBtn)

    /* ---- 构建行 ---- */

    const buildContent = (): void => {
        content.innerHTML = ''
        const currentBindings = input.getBindings()

        for (const group of ACTION_GROUPS) {
            const groupTitle = document.createElement('div')
            groupTitle.className = 'bp-group-title'
            groupTitle.textContent = group.name
            content.appendChild(groupTitle)

            for (const action of group.actions) {
                const row = document.createElement('div')
                row.className = 'bp-row'
                content.appendChild(row)

                const label = document.createElement('span')
                label.className = 'bp-row-label'
                label.textContent = ACTION_LABELS[action]
                row.appendChild(label)

                const combos = currentBindings[action]

                /* 渲染每个绑定 */
                for (let i = 0; i < combos.length; i++) {
                    const combo = combos[i]

                    const keyChip = document.createElement('span')
                    keyChip.className = 'bp-row-key'
                    keyChip.textContent = keyComboToDisplay(combo)
                    row.appendChild(keyChip)

                    /* 编辑按钮 */
                    const editBtn = document.createElement('button')
                    editBtn.className = 'bp-row-btn'
                    editBtn.textContent = '✎'
                    editBtn.title = '替换绑定'
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation()
                        startCapture(action, i, row)
                    })
                    row.appendChild(editBtn)

                    /* 删除按钮 */
                    const delBtn = document.createElement('button')
                    delBtn.className = 'bp-row-btn bp-row-btn-del'
                    delBtn.textContent = '×'
                    delBtn.title = '删除绑定'
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
                    addBtn.className = 'bp-row-btn'
                    addBtn.textContent = '+'
                    addBtn.title = '添加替代绑定'
                    addBtn.addEventListener('click', (e) => {
                        e.stopPropagation()
                        startCapture(action, undefined, row)
                    })
                    row.appendChild(addBtn)
                }
            }
        }
    }

    buildContent()

    /* ---- 按键捕获 ---- */

    const startCapture = (action: InputAction, index: number | undefined, row: HTMLElement): void => {
        isCapturing = true
        /* 标记捕获行 */
        const capturingChip = document.createElement('span')
        capturingChip.className = 'bp-row-key bp-row-key-capturing'
        capturingChip.textContent = '请按键...'
        row.appendChild(capturingChip)
        row.classList.add('bp-row-capturing')

        input.setKeyCapture((combo: KeyCombo) => {
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

            /* 冲突检查 */
            const conflictAction = findConflict(currentBindings, combo, action)

            const applyBinding = (): void => {
                if (conflictAction) {
                    /* 从冲突动作中移除此绑定 */
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

            if (conflictAction) {
                createConflictDialog(conflictAction).confirm.then((confirmed: boolean) => {
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
                        showToast('文件格式无效：根元素必须是对象')
                        return
                    }
                    const obj = parsed as Record<string, unknown>
                    for (const action of INPUT_ACTIONS) {
                        if (!Array.isArray(obj[action])) {
                            showToast(`文件格式无效：缺少动作 "${action}"`)
                            return
                        }
                        const combos = obj[action] as unknown[]
                        if (combos.length === 0) {
                            showToast(`文件格式无效："${ACTION_LABELS[action]}" 没有绑定`)
                            return
                        }
                        for (const combo of combos) {
                            if (!Array.isArray(combo) || combo.some((c: unknown) => typeof c !== 'string')) {
                                showToast(`文件格式无效："${ACTION_LABELS[action]}" 绑定格式错误`)
                                return
                            }
                        }
                    }
                    const bindings = obj as unknown as BindingsMap
                    input.setBindings(bindings)
                    input.saveToStorage()
                    buildContent()
                    showToast('按键配置已导入')
                } catch {
                    showToast('文件格式无效：无法解析 JSON')
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
                input.setKeyCapture(undefined)
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
            input.setKeyCapture(undefined)
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
