import type {ActorStatus, SkillTimerStatus} from './actor.ts'
import {SPEED_OPTIONS} from './constants.ts'
import {translate, type StringLocaleKey} from '../../i18n/index.ts'
import {localizeText, localizeApply} from '../../i18n/dom.ts'
import {createIcon} from '../../ui/icons/icon.ts'

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
    /** 名称渲染（随语言切换重算：武器本地化名 / 种族名） */
    readonly nameOf: () => string
    /** 副名渲染（持握模式 / 种族肢体 / 护甲套装；可能为空串） */
    readonly subOf: () => string
    /** 阵营主色（css 颜色字符串） */
    readonly colorHex: string
}

export interface ShowcasePanel {
    /** 每帧刷新列表/详情/控件状态（内部做脏检查，避免无谓 DOM 写入） */
    refresh: (statuses: readonly ActorStatus[], playing: boolean, speed: number, focusedId: number | null) => void
    /** 移除全部面板 DOM 与注入样式（退出展示模式时调用） */
    dispose: () => void
}

/** 面板标题 / 副标题文案键（不同子模块可自定义；缺省沿用攻击动作展示台文案） */
export interface PanelOptions {
    readonly titleKey?: StringLocaleKey
    readonly subtitleKey?: StringLocaleKey
}

/** 一次性注入面板样式（返回 style 元素供 dispose 移除） */
const injectStyles = (): HTMLStyleElement => {
    const style = document.createElement('style')
    style.textContent = `
.sch-panel {
    position: fixed; top: 16px; left: 16px; width: 336px;
    background: var(--dc-bg-2); color: var(--dc-text);
    font-family: var(--dc-font-mono); font-size: var(--dc-fs-13); line-height: 1.5;
    border: 1px solid var(--dc-border); border-radius: var(--dc-radius-lg);
    box-shadow: var(--dc-shadow-panel), inset 0 0 0 1px var(--dc-hairline);
    padding: 14px 16px 12px; user-select: none;
}
.sch-title { font-family: var(--dc-font-display); font-size: 16px; font-weight: 700; color: var(--dc-gold); letter-spacing: 1px; }
.sch-sub { color: var(--dc-text-dim); font-size: 11px; margin: 2px 0 10px; }
.sch-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.sch-btn {
    background: var(--dc-bg-3); color: var(--dc-text); border: 1px solid var(--dc-border);
    border-radius: var(--dc-radius); padding: 4px 10px; cursor: pointer; font: inherit;
}
.sch-btn:hover { background: var(--dc-bg-2); border-color: var(--dc-border-strong); }
.sch-btn.active { background: var(--dc-bg-3); border-color: var(--dc-orange); color: var(--dc-gold-bright); }
.sch-select {
    background: var(--dc-bg-3); color: var(--dc-text); border: 1px solid var(--dc-border);
    border-radius: var(--dc-radius); padding: 4px 6px; font: inherit; max-width: 132px;
}
.sch-list { max-height: 46vh; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: 3px; }
.sch-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px; border-radius: var(--dc-radius); cursor: pointer;
    border: 1px solid transparent;
}
.sch-row:hover { background: var(--dc-bg-3); }
.sch-row.focused { border-color: var(--dc-gold); background: color-mix(in srgb, var(--dc-gold) 8%, transparent); }
.sch-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.sch-names { flex: 1; min-width: 0; }
.sch-skill { font-weight: 700; }
.sch-weapon { color: var(--dc-text-dim); font-size: 11px; margin-left: 6px; }
.sch-hold { color: var(--dc-gold); font-size: 10px; margin-left: 6px; }
.sch-mid { text-align: right; flex: none; font-size: 11px; color: var(--dc-text-dim); min-width: 108px; }
.sch-phase { color: var(--dc-gold); }
.sch-phase.done { color: var(--dc-text-mute); }
.sch-rowbar { height: 3px; border-radius: var(--dc-radius-sm); background: var(--dc-bg-3); overflow: hidden; margin-top: 3px; }
.sch-rowfill { height: 100%; background: var(--dc-success); width: 0; }
.sch-detail {
    position: fixed; bottom: 16px; right: 16px; width: 268px;
    background: var(--dc-bg-2); color: var(--dc-text);
    font-family: var(--dc-font-mono); font-size: var(--dc-fs-13); line-height: 1.7;
    border: 1px solid var(--dc-border); border-radius: var(--dc-radius-lg);
    box-shadow: var(--dc-shadow-panel), inset 0 0 0 1px var(--dc-hairline);
    padding: 12px 16px; display: none;
}
.sch-detail .sch-title { margin-bottom: 4px; }
.sch-totalbar { height: 6px; border-radius: var(--dc-radius-sm); background: var(--dc-bg-3); overflow: hidden; margin: 6px 0; }
.sch-totalfill { height: 100%; background: var(--dc-gold); width: 0; }
.sch-skillhead { display: flex; gap: 4px; font-size: 9px; color: var(--dc-text-dim); margin-top: 6px; }
.sch-skillhead .sch-skillspacer { min-width: 56px; flex: none; }
.sch-skillhead span { flex: 1; text-align: center; }
.sch-skillrow { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
.sch-skilllabel { opacity: .7; min-width: 56px; font-size: 10px; flex: none; }
.sch-cell { flex: 1; min-width: 0; }
.sch-cellbar { height: 4px; background: var(--dc-bg-3); border-radius: var(--dc-radius-sm); overflow: hidden; }
.sch-cellfill { height: 100%; width: 0; border-radius: var(--dc-radius-sm); }
.sch-celltext { font-size: 9px; text-align: center; opacity: .85; }
.sch-kv b { color: var(--dc-gold); }
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

/** 行级 DOM 引用（refresh 时只改内容不重建） */
interface RowRefs {
    readonly root: HTMLElement
    readonly hit: HTMLElement
    readonly phase: HTMLElement
    readonly fill: HTMLElement
}

export const createPanel = (infos: readonly PanelRowInfo[], callbacks: PanelCallbacks, options?: PanelOptions): ShowcasePanel => {
    const infoById = new Map(infos.map(info => [info.id, info]))
    const style = injectStyles()

    /* —— 主面板（左上） —— */
    const panel = document.createElement('div')
    panel.className = 'sch-panel'

    const title = document.createElement('div')
    title.className = 'sch-title'
    localizeText(title, options?.titleKey ?? 'showcase.title')
    panel.appendChild(title)

    const sub = document.createElement('div')
    sub.className = 'sch-sub'
    localizeText(sub, options?.subtitleKey ?? 'showcase.subtitle')
    panel.appendChild(sub)

    /* 控件行 */
    const controls = document.createElement('div')
    controls.className = 'sch-controls'

    const pauseBtn = document.createElement('button')
    pauseBtn.className = 'sch-btn'
    const pauseIconPause = createIcon('pause', {size: 'sm'})
    const pauseIconPlay = createIcon('play', {size: 'sm'})
    pauseIconPlay.style.display = 'none'
    const pauseLabel = document.createElement('span')
    pauseBtn.appendChild(pauseIconPause)
    pauseBtn.appendChild(pauseIconPlay)
    pauseBtn.appendChild(pauseLabel)
    pauseBtn.addEventListener('click', () => {
        callbacks.onTogglePause()
        pauseBtn.blur()
    })
    controls.appendChild(pauseBtn)

    const stepBtn = document.createElement('button')
    stepBtn.className = 'sch-btn'
    localizeText(stepBtn, 'showcase.step')
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
    localizeText(noneOption, 'showcase.focus_none')
    focusSelect.appendChild(noneOption)
    for (const info of infos) {
        const opt = document.createElement('option')
        opt.value = String(info.id)
        localizeApply(opt, el => {
            const name = info.nameOf()
            const sub = info.subOf()
            el.textContent = sub.length > 0 ? `${name} · ${sub}` : name
        })
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
        localizeApply(skillSpan, el => { el.textContent = info.nameOf() })
        const weaponSpan = document.createElement('span')
        weaponSpan.className = 'sch-weapon'
        const holdSpan = document.createElement('span')
        holdSpan.className = 'sch-hold'
        localizeApply(holdSpan, el => { el.textContent = info.subOf() })
        names.appendChild(skillSpan)
        names.appendChild(weaponSpan)
        names.appendChild(holdSpan)
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
    localizeText(detailTotal, 'showcase.total_progress')
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
    const timerHeaderKeys = ['showcase.timer.action', 'showcase.timer.recovery', 'showcase.timer.cooldown'] as const
    for (const key of timerHeaderKeys) {
        const span = document.createElement('span')
        localizeText(span, key)
        skillsHeader.appendChild(span)
    }
    const skillsList = document.createElement('div')

    const unfocusBtn = document.createElement('button')
    unfocusBtn.className = 'sch-btn'
    localizeText(unfocusBtn, 'showcase.unfocus')
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
            setFill(cell.fill, t.cooldownRemaining / t.cooldown, t.cooldownRemaining > 0 ? 'var(--dc-danger)' : 'var(--dc-info)')
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
        setText(pauseLabel, translate(playing ? 'showcase.pause' : 'showcase.resume'))
        pauseIconPause.style.display = playing ? '' : 'none'
        pauseIconPlay.style.display = playing ? 'none' : ''

        for (const {option, btn} of speedBtns) {
            const active = option === speed
            if (btn.classList.contains('active') !== active) btn.classList.toggle('active', active)
        }

        const selectValue = focusedId === null ? '' : String(focusedId)
        if (focusSelect.value !== selectValue) focusSelect.value = selectValue

        /* 非攻击角色（种族 / 套装展示）无状态快照：行显示「—」，聚焦时仅高亮不展开计时详情 */
        const statusById = new Map(statuses.map(st => [st.id, st]))

        let focusedStatus: ActorStatus | undefined
        for (const info of infos) {
            const refs = rows.get(info.id)
            if (refs === undefined) continue

            const focused = info.id === focusedId
            if (refs.root.classList.contains('focused') !== focused) {
                refs.root.classList.toggle('focused', focused)
            }

            const st = statusById.get(info.id)
            if (st === undefined) {
                setText(refs.hit, translate('showcase.status.stand_walk'))
                setText(refs.phase, '')
                setBar(refs.fill, 0)
                continue
            }

            if (focused) focusedStatus = st

            setText(refs.hit, st.mode === 'idle'
                ? translate('showcase.status.idle')
                : st.mode === 'charging'
                    ? translate('showcase.status.charging')
                    : st.isMelee
                        ? translate({key: 'showcase.status.hit', args: [st.hitNumber, st.totalHits]})
                        : translate('showcase.status.shooting'))
            const phaseText = st.phaseName === 'idle' ? 'idle' : st.phaseName === 'done' ? 'done' : st.phaseName === 'charging' ? translate('showcase.status.charging') : st.phaseName
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
            const info = infoById.get(st.id)
            setText(detailTitle, info === undefined
                ? `${st.weaponName} · ${st.holdModeLabel}`
                : `${info.nameOf()} · ${info.subOf()}`)
            setText(detailHit, st.mode === 'idle'
                ? translate('showcase.detail.status_idle')
                : st.mode === 'charging'
                    ? translate('showcase.detail.status_charging')
                    : st.isMelee
                        ? translate({key: 'showcase.detail.combo', args: [st.hitNumber, st.totalHits]})
                        : translate('showcase.detail.ranged'))
            const detailPercent = (st.phaseProgress * 100).toFixed(0)
            setText(detailPhase, st.mode === 'idle'
                ? translate('showcase.detail.phase_none')
                : st.mode === 'charging'
                    ? translate('showcase.detail.phase_charging')
                    : st.phaseName === 'done'
                        ? translate({key: 'showcase.detail.phase_done', args: [detailPercent]})
                        : translate({key: 'showcase.detail.phase_running', args: [st.phaseName, detailPercent]}))
            setText(detailLink, st.mode === 'idle'
                ? translate('showcase.detail.link_none')
                : st.mode === 'charging'
                    ? translate('showcase.detail.link_charging')
                    : translate({key: 'showcase.detail.link', args: [translate(st.link)]}))
            setBar(totalFill, st.attackProgress)

            /* 技能三计时器：与 play HUD 同规则逐格刷新 */
            if (timerBuiltFor !== st.id) {
                rebuildTimerRows(st.slotTimers)
                timerBuiltFor = st.id
            }
            st.slotTimers.forEach((t, i) => {
                const row = timerRows[i]
                if (row === undefined) return
                applyElapsedCell(row.cells[0], t.actionElapsed, t.duration, 'var(--dc-orange-bright)')
                applyElapsedCell(row.cells[1], t.recoveryElapsed, t.recovery, 'var(--dc-info)')
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
