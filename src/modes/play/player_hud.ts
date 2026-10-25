/**
 * 玩家 HUD — 左上角常驻显示生命、韧性、体力、格挡与蓄力
 */
import {translate} from '../../i18n/index.ts'
import {localizeText} from '../../i18n/dom.ts'

export interface PlayerHUDData {
    health: number
    maxHealth: number
    /** 当前韧性值 */
    poise: number
    /** 韧性上界 */
    poiseMax: number
    /** 当前体力值 */
    stamina: number
    /** 体力上限 */
    staminaMax: number
    /** 当前格挡槽值（仅持盾时有效） */
    guard: number
    /** 格挡槽上限（0 = 未持盾，隐藏格挡条） */
    guardMax: number
    /** 远程蓄力值（0~1） */
    charge: number
    /** 是否正在蓄力（显示蓄力条） */
    charging: boolean
}

export interface PlayerHUD {
    update: (data: PlayerHUDData) => void
    setVisible: (visible: boolean) => void
    destroy: () => void
}

/** HUD 计时条填充色令牌（与主题色一致） */
const FILL_SUCCESS = 'var(--dc-success)'
const FILL_WARNING = 'var(--dc-warning)'
const FILL_DANGER = 'var(--dc-danger)'
const FILL_ORANGE = 'var(--dc-orange-bright)'
const FILL_INFO = 'var(--dc-info)'

export const createPlayerHUD = (): PlayerHUD => {
    const el = document.createElement('div')
    el.id = 'player-hud'
    el.className = 'dc-panel dc-mono'
    el.style.cssText = [
        'position:fixed;top:16px;left:16px;',
        'padding:10px 14px;min-width:240px;',
        'pointer-events:none;z-index:100;',
        'display:none;',
    ].join(' ')

    const label = document.createElement('div')
    label.className = 'dc-hint'
    label.style.cssText = 'margin-bottom:2px'
    localizeText(label, 'play.hud.hp')
    el.appendChild(label)

    const barOuter = document.createElement('div')
    barOuter.className = 'dc-bar'
    barOuter.style.cssText = 'height:8px;margin:4px 0'
    const barInner = document.createElement('div')
    /* 宽度不加过渡（每帧重写，缓动会滞后）；背景色保留短过渡以平滑颜色切换 */
    barInner.className = 'dc-bar__fill'
    barInner.style.cssText = `height:100%;width:100%;background:${FILL_SUCCESS};transition:background .15s`
    barOuter.appendChild(barInner)
    el.appendChild(barOuter)

    const hpText = document.createElement('div')
    hpText.style.cssText = 'text-align:right;font-size:12px;margin-bottom:6px'
    el.appendChild(hpText)

    /* 韧性条：韧性归零会触发倒地（bump 受击硬直/破韧） */
    const poiseLabel = document.createElement('div')
    poiseLabel.className = 'dc-hint'
    poiseLabel.style.cssText = 'margin-bottom:2px'
    localizeText(poiseLabel, 'play.hud.poise')
    el.appendChild(poiseLabel)

    const poiseOuter = document.createElement('div')
    poiseOuter.className = 'dc-bar'
    poiseOuter.style.cssText = 'height:6px;margin-bottom:6px'
    const poiseInner = document.createElement('div')
    poiseInner.className = 'dc-bar__fill'
    poiseInner.style.cssText = `height:100%;width:100%;background:${FILL_INFO};transition:background .15s`
    poiseOuter.appendChild(poiseInner)
    el.appendChild(poiseOuter)

    /* 体力条：跑步 / 飞行 / 格挡持续消耗，攻击 / 翻滚 / 跳跃一次性消耗 */
    const staminaLabel = document.createElement('div')
    staminaLabel.className = 'dc-hint'
    staminaLabel.style.cssText = 'margin-bottom:2px'
    localizeText(staminaLabel, 'play.hud.stamina')
    el.appendChild(staminaLabel)

    const staminaOuter = document.createElement('div')
    staminaOuter.className = 'dc-bar'
    staminaOuter.style.cssText = 'height:6px;margin-bottom:6px'
    const staminaInner = document.createElement('div')
    staminaInner.className = 'dc-bar__fill'
    staminaInner.style.cssText = `height:100%;width:100%;background:${FILL_WARNING};transition:background .15s`
    staminaOuter.appendChild(staminaInner)
    el.appendChild(staminaOuter)

    /* 格挡槽条（仅持盾时显示）：格挡消耗、归零触发破防（guard_broken） */
    const guardRow = document.createElement('div')
    guardRow.style.cssText = 'display:none;margin-bottom:6px'
    const guardLabel = document.createElement('div')
    guardLabel.className = 'dc-hint'
    guardLabel.style.cssText = 'margin-bottom:2px'
    localizeText(guardLabel, 'play.hud.guard')
    const guardOuter = document.createElement('div')
    guardOuter.className = 'dc-bar'
    guardOuter.style.cssText = 'height:6px'
    const guardInner = document.createElement('div')
    guardInner.className = 'dc-bar__fill'
    guardInner.style.cssText = `height:100%;width:100%;background:${FILL_INFO};transition:background .15s`
    guardOuter.appendChild(guardInner)
    guardRow.appendChild(guardLabel)
    guardRow.appendChild(guardOuter)
    el.appendChild(guardRow)

    /* 蓄力条（仅蓄力时显示）：远程弓 / 投掷物的按住蓄力进度 */
    const chargeRow = document.createElement('div')
    chargeRow.style.cssText = 'display:none;margin-bottom:6px'
    const chargeLabel = document.createElement('div')
    chargeLabel.className = 'dc-hint'
    chargeLabel.style.cssText = 'margin-bottom:2px'
    chargeLabel.textContent = translate('play.hud.charge')
    const chargeBar = document.createElement('div')
    chargeBar.className = 'dc-bar'
    chargeBar.style.cssText = 'height:6px'
    const chargeFill = document.createElement('div')
    chargeFill.className = 'dc-bar__fill'
    chargeFill.style.cssText = `height:100%;width:0;background:${FILL_ORANGE}`
    chargeBar.appendChild(chargeFill)
    chargeRow.appendChild(chargeLabel)
    chargeRow.appendChild(chargeBar)
    el.appendChild(chargeRow)

    document.body.appendChild(el)

    const update = (data: PlayerHUDData): void => {
        const pct = Math.max(0, Math.min(1, data.health / data.maxHealth))
        barInner.style.width = `${pct * 100}%`
        if (pct > 0.5) barInner.style.background = FILL_SUCCESS
        else if (pct > 0.25) barInner.style.background = FILL_WARNING
        else barInner.style.background = FILL_DANGER
        hpText.textContent = `${data.health} / ${data.maxHealth}`

        const poisePct = data.poiseMax > 0 ? Math.max(0, Math.min(1, data.poise / data.poiseMax)) : 0
        poiseInner.style.width = `${poisePct * 100}%`
        poiseInner.style.background = poisePct > 0.25 ? FILL_INFO : FILL_DANGER

        const staminaPct = data.staminaMax > 0 ? Math.max(0, Math.min(1, data.stamina / data.staminaMax)) : 0
        staminaInner.style.width = `${staminaPct * 100}%`
        staminaInner.style.background = staminaPct > 0.25 ? FILL_WARNING : FILL_DANGER

        guardRow.style.display = data.guardMax > 0 ? '' : 'none'
        if (data.guardMax > 0) {
            const guardPct = Math.max(0, Math.min(1, data.guard / data.guardMax))
            guardInner.style.width = `${guardPct * 100}%`
            guardInner.style.background = guardPct > 0.25 ? FILL_INFO : FILL_DANGER
        }

        chargeRow.style.display = data.charging ? '' : 'none'
        if (data.charging) {
            const ratio = Math.max(0, Math.min(1, data.charge))
            chargeFill.style.width = `${ratio * 100}%`
            chargeFill.style.background = ratio >= 1 ? FILL_DANGER : FILL_ORANGE
            chargeLabel.textContent = translate({key: 'play.hud.charge_pct', args: [String(Math.round(ratio * 100))]})
        }
    }

    const setVisible = (visible: boolean): void => {
        el.style.display = visible ? '' : 'none'
    }

    const destroy = (): void => { el.remove() }

    return {update, setVisible, destroy}
}
