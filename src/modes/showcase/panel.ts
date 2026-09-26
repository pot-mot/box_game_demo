import type {ActorStatus, SkillTimerStatus} from './actor.ts'
import {SPEED_OPTIONS} from './constants.ts'

/** 面板控件的回调（由模式装配注入实际控制逻辑） */
export interface PanelCallbacks {
    readonly onTogglePause: () => void
    readonly onStep: () => void
    readonly onSpeed: (speed: number) => void
    readonly onFocus: (actorId: number | null) => void
}

/** 建行所需的静态信息 */
export interface PanelRowInfo {
    readonly id: number
    /** 名称行（重构后为武器中文名，与 weaponName 同值） */
    readonly skillName: string
    readonly weaponName: string
    /** 阵营主色（css 颜色字符串） */
    readonly colorHex: string
}

export interface ShowcasePanel {
    /** 每帧刷新列表/详情/控件状态（内部做脏检查，避免无谓 DOM 写入） */
    refresh: (statuses: readonly ActorStatus[], playing: boolean, speed: number, focusedId: number | null) => void
    /** 移除全部面板 DOM 与注入样式（退出展示模式时调用） */
    dispose: () => void
}

/** 一次性注入面板样式（返回 style 元素供 dispose 移除） */
const injectStyles = (): HTMLStyleElement => {
    const style = document.createElement('style')
    style.textContent = `
.sch-panel {
    position: fixed; top: 16px; left: 16px; width: 336px;
    background: rgba(0, 0, 0, .72); color: #e8e4da;
    font: 13px/1.5 Consolas, 'Microsoft YaHei', monospace;
    border-radius: 10px; padding: 14px 16px 12px;
    backdrop-filter: blur(4px); user-select: none;
}
.sch-title { font-size: 16px; font-weight: 700; color: #ffd070; letter-spacing: 1px; }
.sch-sub { color: #9aa3b2; font-size: 11px; margin: 2px 0 10px; }
.sch-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.sch-btn {
    background: #2a2f3a; color: #e8e4da; border: 1px solid #3a4150;
    border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit;
}
.sch-btn:hover { background: #353c4a; }
.sch-btn.active { background: #4a5a3a; border-color: #7a9a5a; color: #ffe9a0; }
.sch-select {
    background: #2a2f3a; color: #e8e4da; border: 1px solid #3a4150;
    border-radius: 6px; padding: 4px 6px; font: inherit; max-width: 132px;
}
.sch-list { max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.sch-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px; border-radius: 6px; cursor: pointer;
    border: 1px solid transparent;
}
.sch-row:hover { background: rgba(255, 255, 255, .06); }
.sch-row.focused { border-color: #ffd070; background: rgba(255, 208, 112, .08); }
.sch-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.sch-names { flex: 1; min-width: 0; }
.sch-skill { font-weight: 700; }
.sch-weapon { color: #9aa3b2; font-size: 11px; margin-left: 6px; }
.sch-mid { text-align: right; flex: none; font-size: 11px; color: #c8cdd8; min-width: 108px; }
.sch-phase { color: #ffd070; }
.sch-phase.done { color: #77808f; }
.sch-rowbar { height: 3px; border-radius: 2px; background: #2a2f3a; overflow: hidden; margin-top: 3px; }
.sch-rowfill { height: 100%; background: #7a9a5a; width: 0; }
.sch-detail {
    position: fixed; bottom: 16px; right: 16px; width: 268px;
    background: rgba(0, 0, 0, .72); color: #e8e4da;
    font: 13px/1.7 Consolas, 'Microsoft YaHei', monospace;
    border-radius: 10px; padding: 12px 16px; display: none;
    border: 1px solid rgba(255, 208, 112, .4);
}
.sch-detail .sch-title { margin-bottom: 4px; }
.sch-totalbar { height: 6px; border-radius: 3px; background: #2a2f3a; overflow: hidden; margin: 6px 0; }
.sch-totalfill { height: 100%; background: #ffd070; width: 0; }
.sch-skillhead { display: flex; gap: 4px; font-size: 9px; color: #9aa3b2; margin-top: 6px; }
.sch-skillhead .sch-skillspacer { min-width: 56px; flex: none; }
.sch-skillhead span { flex: 1; text-align: center; }
.sch-skillrow { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
.sch-skilllabel { opacity: .7; min-width: 56px; font-size: 10px; flex: none; }
.sch-cell { flex: 1; min-width: 0; }
.sch-cellbar { height: 4px; background: #2a2f3a; border-radius: 2px; overflow: hidden; }
.sch-cellfill { height: 100%; width: 0; border-radius: 2px; }
.sch-celltext { font-size: 9px; text-align: center; opacity: .85; }
.sch-kv b { color: #ffd070; }
`
    document.head.appendChild(style)
    return style
}

/** 脏检查写 textContent（值未变化时跳过 DOM 写入） */
const setText = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text
}

/** 脏检查写进度条宽度 */
const setBar = (el: HTMLElement, ratio: number): void => {
    const width = `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`
    if (el.style.width !== width) el.style.width = width
}

/** 脏检查写填充条颜色 */
const setFill = (el: HTMLElement, ratio: number, color: string): void => {
    setBar(el, ratio)
    if (el.style.background !== color) el.style.background = color
}

/** 名称拼接：名称行与副名相同（重构后同为武器中文名）时只显示一次，避免重复文案 */
const joinNames = (primary: string, secondary: string): string =>
    primary === secondary || secondary === '' ? primary : `${primary} · ${secondary}`

/** 行级 DOM 引用（refresh 时只改内容不重建） */
interface RowRefs {
    readonly root: HTMLElement
    readonly hit: HTMLElement
    readonly phase: HTMLElement
    readonly fill: HTMLElement
}

export const createPanel = (infos: readonly PanelRowInfo[], callbacks: PanelCallbacks): ShowcasePanel => {
    const style = injectStyles()

    /* —— 主面板（左上） —— */
    const panel = document.createElement('div')
    panel.className = 'sch-panel'

    const title = document.createElement('div')
    title.className = 'sch-title'
    title.textContent = '攻击动作展示台'
    panel.appendChild(title)

    const sub = document.createElement('div')
    sub.className = 'sch-sub'
    sub.textContent = '全武器攻击阶段动画 · 连段衔接时序复现'
    panel.appendChild(sub)

    /* 控件行 */
    const controls = document.createElement('div')
    controls.className = 'sch-controls'

    const pauseBtn = document.createElement('button')
    pauseBtn.className = 'sch-btn'
    pauseBtn.textContent = '⏸ 暂停'
    pauseBtn.addEventListener('click', () => {
        callbacks.onTogglePause()
        pauseBtn.blur()
    })
    controls.appendChild(pauseBtn)

    const stepBtn = document.createElement('button')
    stepBtn.className = 'sch-btn'
    stepBtn.textContent = '⏭ 单步'
    stepBtn.addEventListener('click', () => {
        callbacks.onStep()
        stepBtn.blur()
    })
    controls.appendChild(stepBtn)

    const speedBtns = SPEED_OPTIONS.map(option => {
        const btn = document.createElement('button')
        btn.className = 'sch-btn'
        btn.textContent = `${option}×`
        btn.addEventListener('click', () => {
            callbacks.onSpeed(option)
            btn.blur()
        })
        controls.appendChild(btn)
        return {option, btn}
    })

    const focusSelect = document.createElement('select')
    focusSelect.className = 'sch-select'
    const noneOption = document.createElement('option')
    noneOption.value = ''
    noneOption.textContent = '聚焦：无'
    focusSelect.appendChild(noneOption)
    for (const info of infos) {
        const opt = document.createElement('option')
        opt.value = String(info.id)
        opt.textContent = info.skillName
        focusSelect.appendChild(opt)
    }
    focusSelect.addEventListener('change', () => {
        callbacks.onFocus(focusSelect.value === '' ? null : Number(focusSelect.value))
        focusSelect.blur()
    })
    controls.appendChild(focusSelect)
    panel.appendChild(controls)

    /* 角色列表 */
    const list = document.createElement('div')
    list.className = 'sch-list'
    const rows = new Map<number, RowRefs>()
    for (const info of infos) {
        const root = document.createElement('div')
        root.className = 'sch-row'
        root.addEventListener('click', () => callbacks.onFocus(info.id))

        const dot = document.createElement('span')
        dot.className = 'sch-dot'
        dot.style.background = info.colorHex
        root.appendChild(dot)

        const names = document.createElement('div')
        names.className = 'sch-names'
        const skillSpan = document.createElement('span')
        skillSpan.className = 'sch-skill'
        skillSpan.textContent = info.skillName
        const weaponSpan = document.createElement('span')
        weaponSpan.className = 'sch-weapon'
        /* 副名与名称行同值时留空（重构后二者同为武器中文名） */
        weaponSpan.textContent = info.weaponName === info.skillName ? '' : info.weaponName
        names.appendChild(skillSpan)
        names.appendChild(weaponSpan)
        root.appendChild(names)

        const mid = document.createElement('div')
        mid.className = 'sch-mid'
        const hit = document.createElement('div')
        const phase = document.createElement('span')
        phase.className = 'sch-phase'
        mid.appendChild(hit)
        mid.appendChild(phase)
        root.appendChild(mid)

        const bar = document.createElement('div')
        bar.className = 'sch-rowbar'
        const fill = document.createElement('div')
        fill.className = 'sch-rowfill'
        bar.appendChild(fill)
        root.appendChild(bar)

        list.appendChild(root)
        rows.set(info.id, {root, hit, phase, fill})
    }
    panel.appendChild(list)
    document.body.appendChild(panel)

    /* —— 聚焦详情卡（右上） —— */
    const detail = document.createElement('div')
    detail.className = 'sch-detail'
    const detailTitle = document.createElement('div')
    detailTitle.className = 'sch-title'
    const detailHit = document.createElement('div')
    const detailPhase = document.createElement('div')
    const detailTotal = document.createElement('div')
    detailTotal.textContent = '攻击总进度'
    const totalBar = document.createElement('div')
    totalBar.className = 'sch-totalbar'
    const totalFill = document.createElement('div')
    totalFill.className = 'sch-totalfill'
    totalBar.appendChild(totalFill)
    const detailLink = document.createElement('div')

    /* 技能计时区块（与 play HUD 同语义：每段一行，动作/恢复/冷却三格） */
    const skillsHeader = document.createElement('div')
    skillsHeader.className = 'sch-skillhead'
    const headSpacer = document.createElement('span')
    headSpacer.className = 'sch-skillspacer'
    skillsHeader.appendChild(headSpacer)
    for (const h of ['动作', '恢复', '冷却']) {
        const span = document.createElement('span')
        span.textContent = h
        skillsHeader.appendChild(span)
    }
    const skillsList = document.createElement('div')

    const unfocusBtn = document.createElement('button')
    unfocusBtn.className = 'sch-btn'
    unfocusBtn.textContent = '取消聚焦'
    unfocusBtn.addEventListener('click', () => callbacks.onFocus(null))
    detail.appendChild(detailTitle)
    detail.appendChild(detailHit)
    detail.appendChild(detailPhase)
    detail.appendChild(detailTotal)
    detail.appendChild(totalBar)
    detail.appendChild(skillsHeader)
    detail.appendChild(skillsList)
    detail.appendChild(detailLink)
    detail.appendChild(unfocusBtn)
    document.body.appendChild(detail)

    /* —— 技能计时行：聚焦对象切换时重建，每帧只刷内容 —— */
    interface TimerCellRefs {
        readonly root: HTMLElement
        readonly fill: HTMLElement
        readonly text: HTMLElement
    }
    const makeTimerCell = (): TimerCellRefs => {
        const cell = document.createElement('div')
        cell.className = 'sch-cell'
        const bar = document.createElement('div')
        bar.className = 'sch-cellbar'
        const fill = document.createElement('div')
        fill.className = 'sch-cellfill'
        bar.appendChild(fill)
        const text = document.createElement('div')
        text.className = 'sch-celltext'
        cell.appendChild(bar)
        cell.appendChild(text)
        return {root: cell, fill, text}
    }
    let timerBuiltFor: number | null = null
    let timerRows: {readonly cells: readonly [TimerCellRefs, TimerCellRefs, TimerCellRefs]}[] = []
    const rebuildTimerRows = (timers: readonly SkillTimerStatus[]): void => {
        skillsList.replaceChildren()
        timerRows = timers.map(t => {
            const row = document.createElement('div')
            row.className = 'sch-skillrow'
            const label = document.createElement('span')
            label.className = 'sch-skilllabel'
            label.textContent = t.label
            row.appendChild(label)
            const action = makeTimerCell()
            const recovery = makeTimerCell()
            const cooldown = makeTimerCell()
            row.appendChild(action.root)
            row.appendChild(recovery.root)
            row.appendChild(cooldown.root)
            skillsList.appendChild(row)
            return {cells: [action, recovery, cooldown] as const}
        })
    }
    /** 动作/恢复格：计时中填充，否则静态显示配置时长 */
    const applyElapsedCell = (cell: TimerCellRefs, elapsed: number, total: number, color: string): void => {
        if (elapsed >= 0 && total > 0) {
            setFill(cell.fill, elapsed / total, color)
            setText(cell.text, `${elapsed.toFixed(2)}s`)
        } else {
            setFill(cell.fill, 0, 'transparent')
            setText(cell.text, total > 0 ? `${total.toFixed(2)}s` : '-')
        }
    }
    /** 冷却格：触发瞬间满条随冷却排空（同 play HUD）；无冷却常显 0.0s */
    const applyCooldownCell = (cell: TimerCellRefs, t: SkillTimerStatus): void => {
        if (t.cooldown > 0) {
            setFill(cell.fill, t.cooldownRemaining / t.cooldown, t.cooldownRemaining > 0 ? '#ff6644' : '#4488ff')
            setText(cell.text, `${t.cooldownRemaining.toFixed(1)}s`)
        } else {
            setFill(cell.fill, 0, 'transparent')
            setText(cell.text, '0.0s')
        }
    }

    const refresh = (
        statuses: readonly ActorStatus[],
        playing: boolean,
        speed: number,
        focusedId: number | null,
    ): void => {
        setText(pauseBtn, playing ? '⏸ 暂停' : '▶ 继续')

        for (const {option, btn} of speedBtns) {
            const active = option === speed
            if (btn.classList.contains('active') !== active) btn.classList.toggle('active', active)
        }

        const selectValue = focusedId === null ? '' : String(focusedId)
        if (focusSelect.value !== selectValue) focusSelect.value = selectValue

        let focusedStatus: ActorStatus | undefined
        for (const st of statuses) {
            const refs = rows.get(st.id)
            if (refs === undefined) continue

            const focused = st.id === focusedId
            if (refs.root.classList.contains('focused') !== focused) {
                refs.root.classList.toggle('focused', focused)
            }
            if (focused) focusedStatus = st

            setText(refs.hit, st.mode === 'idle'
                ? '待机'
                : `${st.isMelee ? `击${st.hitNumber}/${st.totalHits}` : '射击'}`)
            const phaseText = st.phaseName === 'idle' ? 'idle' : st.phaseName === 'done' ? 'done' : st.phaseName
            setText(refs.phase, ` ${phaseText}`)
            const doneClass = st.phaseName === 'done' || st.phaseName === 'idle'
            if (refs.phase.classList.contains('done') !== doneClass) {
                refs.phase.classList.toggle('done', doneClass)
            }
            setBar(refs.fill, st.phaseProgress)
        }

        /* 详情卡：仅聚焦时可见 */
        const showDetail = focusedStatus !== undefined
        if (detail.style.display !== (showDetail ? 'block' : 'none')) {
            detail.style.display = showDetail ? 'block' : 'none'
        }
        if (focusedStatus !== undefined) {
            const st = focusedStatus
            setText(detailTitle, joinNames(st.skillName, st.weaponName))
            setText(detailHit, st.mode === 'idle'
                ? '状态：待机'
                : `${st.isMelee ? `连段第 ${st.hitNumber}/${st.totalHits} 击` : '远程射击序列'}`)
            setText(detailPhase, st.mode === 'idle'
                ? '阶段：—'
                : `阶段：${st.phaseName === 'done' ? '收势(全部阶段完成)' : st.phaseName} · ${(st.phaseProgress * 100).toFixed(0)}%`)
            setText(detailLink, st.mode === 'idle' ? '衔接：—' : `衔接：${st.link}`)
            setBar(totalFill, st.attackProgress)

            /* 技能三计时器：与 play HUD 同规则逐格刷新 */
            if (timerBuiltFor !== st.id) {
                rebuildTimerRows(st.slotTimers)
                timerBuiltFor = st.id
            }
            st.slotTimers.forEach((t, i) => {
                const row = timerRows[i]
                if (row === undefined) return
                applyElapsedCell(row.cells[0], t.actionElapsed, t.duration, '#ffaa00')
                applyElapsedCell(row.cells[1], t.recoveryElapsed, t.recovery, '#44ccff')
                applyCooldownCell(row.cells[2], t)
            })
        }
    }

    const dispose = (): void => {
        panel.remove()
        detail.remove()
        style.remove()
    }

    return {refresh, dispose}
}
