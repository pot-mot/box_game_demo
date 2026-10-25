/**
 * 玩家调试 HUD — 默认隐藏，按键由输入动作 `toggle_debug_hud` 控制（默认 ~）。
 * 展示状态 / 装备 / 坐标 / 朝向 / 相机角度与技能计时等调试数据。
 */
import {translate} from '../../i18n/index.ts'
import {localizeText} from '../../i18n/dom.ts'

/** 通用计时器行数据 */
export interface TimerRowData {
    label: string
    /** 0~1 进度条填充比例 */
    fillRatio: number
    fillColor: string
    text: string
    visible: boolean
}

/** 计时器单元格 — 技能行中动作/恢复/冷却三者之一 */
export interface TimerCellData {
    /** 0~1 进度条填充比例 */
    fillRatio: number
    fillColor: string
    text: string
}

/** 技能计时器行 — 单个技能槽的动作/恢复/冷却三个计时器同行展示 */
export interface SkillTimerRowData {
    label: string
    /** 动作时间计时（config.duration） */
    action: TimerCellData
    /** 恢复时间计时（config.recovery） */
    recovery: TimerCellData
    /** 冷却时间计时（config.cooldown，触发时开始） */
    cooldown: TimerCellData
}

export interface PlayerDebugHUDData {
    stateName: string
    stateTime: number
    timers: ReadonlyArray<TimerRowData>
    skillTimers: ReadonlyArray<SkillTimerRowData>
    /** 当前武器名（装备行显示） */
    weaponLabel: string
    /** 当前攻击模组中文名 */
    attackModuleLabel: string
    /** 玩家渲染插值坐标（身体中心） */
    positionX: number
    positionY: number
    positionZ: number
    /** 玩家朝向（度，0~360） */
    facingDeg: number
    /** 相机水平朝向（度，0~360） */
    cameraYawDeg: number
    /** 相机俯仰角（度，-90~90） */
    cameraPitchDeg: number
}

export interface PlayerDebugHUD {
    update: (data: PlayerDebugHUDData) => void
    setVisible: (visible: boolean) => void
    destroy: () => void
}

interface TimerRow {
    row: HTMLDivElement
    label: HTMLElement
    fill: HTMLElement
    text: HTMLElement
}

interface TimerCell {
    /** 单元格根容器（flex:1，挂到技能行） */
    root: HTMLDivElement
    fill: HTMLElement
    text: HTMLElement
}

interface SkillTimerRow {
    row: HTMLDivElement
    label: HTMLElement
    action: TimerCell
    recovery: TimerCell
    cooldown: TimerCell
}

export const createPlayerDebugHUD = (): PlayerDebugHUD => {
    const el = document.createElement('div')
    el.id = 'player-debug-hud'
    el.className = 'dc-panel dc-mono'
    el.style.cssText = [
        'position:fixed;top:16px;left:280px;',
        'padding:10px 14px;min-width:240px;',
        'pointer-events:none;z-index:100;',
        'display:none;',
    ].join(' ')

    const title = document.createElement('div')
    title.className = 'dc-hint'
    title.style.cssText = 'margin-bottom:4px'
    localizeText(title, 'play.debug.title')
    el.appendChild(title)

    const stateEl = document.createElement('div')
    stateEl.style.cssText = 'font-size:12px'
    el.appendChild(stateEl)

    /* 装备行：当前武器 + 持握模式（Ctrl 切换） */
    const loadoutEl = document.createElement('div')
    loadoutEl.className = 'dc-dim'
    loadoutEl.style.cssText = 'font-size:12px'
    el.appendChild(loadoutEl)

    const positionEl = document.createElement('div')
    positionEl.className = 'dc-dim'
    positionEl.style.cssText = 'font-size:12px'
    el.appendChild(positionEl)

    const facingEl = document.createElement('div')
    facingEl.className = 'dc-dim'
    facingEl.style.cssText = 'font-size:12px'
    el.appendChild(facingEl)

    const cameraEl = document.createElement('div')
    cameraEl.className = 'dc-dim'
    cameraEl.style.cssText = 'font-size:12px'
    el.appendChild(cameraEl)

    const timersTitle = document.createElement('div')
    timersTitle.className = 'dc-hint'
    timersTitle.style.cssText = 'margin-top:4px'
    localizeText(timersTitle, 'play.hud.timers')
    el.appendChild(timersTitle)

    const timersList = document.createElement('div')
    timersList.style.cssText = 'font-size:11px'
    el.appendChild(timersList)

    const skillsTitle = document.createElement('div')
    skillsTitle.className = 'dc-hint'
    skillsTitle.style.cssText = 'margin-top:6px'
    localizeText(skillsTitle, 'play.hud.skills')
    el.appendChild(skillsTitle)

    /* 列头：动作 / 恢复 / 冷却 */
    const skillsHeader = document.createElement('div')
    skillsHeader.className = 'dc-mute'
    skillsHeader.style.cssText = 'display:flex;gap:4px;font-size:9px;margin-top:2px'
    const headerSpacer = document.createElement('span')
    headerSpacer.style.cssText = 'min-width:56px'
    skillsHeader.appendChild(headerSpacer)
    for (const key of ['play.hud.col.action', 'play.hud.col.recovery', 'play.hud.col.cooldown'] as const) {
        const span = document.createElement('span')
        span.style.cssText = 'flex:1;text-align:center'
        localizeText(span, key)
        skillsHeader.appendChild(span)
    }
    el.appendChild(skillsHeader)

    const skillsList = document.createElement('div')
    skillsList.style.cssText = 'font-size:11px'
    el.appendChild(skillsList)

    document.body.appendChild(el)

    let timerRows: TimerRow[] = []

    const ensureTimerRows = (count: number): void => {
        while (timerRows.length < count) {
            const row = document.createElement('div')
            row.className = 'dc-row'
            row.style.cssText = 'gap:4px;margin-top:1px'
            const lbl = document.createElement('span')
            lbl.className = 'dc-dim'
            lbl.style.cssText = 'min-width:36px'
            const bar = document.createElement('div')
            bar.className = 'dc-bar'
            bar.style.cssText = 'height:4px;flex:1'
            const fill = document.createElement('div')
            /* 不加 CSS 过渡：每帧重写 width，逐帧更新本身即平滑（同技能单元格） */
            fill.className = 'dc-bar__fill'
            fill.style.cssText = 'height:100%;width:100%'
            bar.appendChild(fill)
            const txt = document.createElement('span')
            txt.style.cssText = 'min-width:64px;text-align:right'
            row.appendChild(lbl)
            row.appendChild(bar)
            row.appendChild(txt)
            timersList.appendChild(row)
            timerRows.push({row, label: lbl, fill, text: txt})
        }
        while (timerRows.length > count) {
            const removed = timerRows.pop()
            if (removed) removed.row.remove()
        }
    }

    let skillRows: SkillTimerRow[] = []

    /** 创建单个计时器单元格（迷你进度条 + 下方文本） */
    const makeCell = (): TimerCell => {
        const cell = document.createElement('div')
        cell.style.cssText = 'flex:1;min-width:0'
        const bar = document.createElement('div')
        bar.className = 'dc-bar'
        bar.style.cssText = 'height:4px'
        const fill = document.createElement('div')
        /* 不加 CSS 过渡：HUD 每帧重写 width，缓动会导致显示值滞后真实值（起止两端差一），逐帧更新本身即平滑 */
        fill.className = 'dc-bar__fill'
        fill.style.cssText = 'height:100%;width:100%'
        bar.appendChild(fill)
        const txt = document.createElement('div')
        txt.style.cssText = 'font-size:9px;text-align:center;opacity:.85'
        cell.appendChild(bar)
        cell.appendChild(txt)
        return {root: cell, fill, text: txt}
    }

    const ensureSkillRows = (count: number): void => {
        while (skillRows.length < count) {
            const row = document.createElement('div')
            row.className = 'dc-row'
            row.style.cssText = 'gap:4px;margin-top:3px'
            const lbl = document.createElement('span')
            lbl.className = 'dc-dim'
            lbl.style.cssText = 'min-width:56px;font-size:10px'
            row.appendChild(lbl)
            const action = makeCell()
            const recovery = makeCell()
            const cooldown = makeCell()
            row.appendChild(action.root)
            row.appendChild(recovery.root)
            row.appendChild(cooldown.root)
            skillsList.appendChild(row)
            skillRows.push({row, label: lbl, action, recovery, cooldown})
        }
        while (skillRows.length > count) {
            const removed = skillRows.pop()
            if (removed) removed.row.remove()
        }
    }

    const applyCell = (cell: TimerCell, data: TimerCellData): void => {
        cell.fill.style.width = `${Math.max(0, Math.min(1, data.fillRatio)) * 100}%`
        cell.fill.style.background = data.fillColor
        cell.text.textContent = data.text
    }

    const update = (data: PlayerDebugHUDData): void => {
        stateEl.textContent = translate({key: 'play.hud.state', args: [data.stateName, data.stateTime.toFixed(2)]})
        loadoutEl.textContent = translate({key: 'play.hud.loadout', args: [data.weaponLabel, data.attackModuleLabel]})
        positionEl.textContent = translate({
            key: 'play.debug.position',
            args: [data.positionX.toFixed(2), data.positionY.toFixed(2), data.positionZ.toFixed(2)],
        })
        facingEl.textContent = translate({key: 'play.debug.facing', args: [data.facingDeg.toFixed(1)]})
        cameraEl.textContent = translate({
            key: 'play.debug.camera',
            args: [data.cameraYawDeg.toFixed(1), data.cameraPitchDeg.toFixed(1)],
        })

        const count = data.timers.length
        ensureTimerRows(count)
        for (let i = 0; i < count; i++) {
            const t = data.timers[i]
            const r = timerRows[i]
            r.label.textContent = t.label
            r.fill.style.width = `${t.fillRatio * 100}%`
            r.fill.style.background = t.fillColor
            r.text.textContent = t.text
            r.row.style.display = t.visible ? '' : 'none'
        }

        const skillCount = data.skillTimers.length
        ensureSkillRows(skillCount)
        for (let i = 0; i < skillCount; i++) {
            const s = data.skillTimers[i]
            const r = skillRows[i]
            r.label.textContent = s.label
            applyCell(r.action, s.action)
            applyCell(r.recovery, s.recovery)
            applyCell(r.cooldown, s.cooldown)
        }
    }

    const setVisible = (visible: boolean): void => {
        el.style.display = visible ? '' : 'none'
    }

    const destroy = (): void => { el.remove() }

    return {update, setVisible, destroy}
}
