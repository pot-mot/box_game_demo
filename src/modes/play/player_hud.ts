/**
 * 玩家 HUD — 左上角显示生命值、状态计时器、技能冷却
 */
export interface PlayerHUDData {
    health: number
    maxHealth: number
    stateName: string
    stateTime: number
    skills: ReadonlyArray<{
        id: string
        cooldownTimer: number
        cooldownMax: number
    }>
    attackTimer: number
    attackDuration: number
}

export interface PlayerHUD {
    update: (data: PlayerHUDData) => void
    setVisible: (visible: boolean) => void
    destroy: () => void
}

export const createPlayerHUD = (): PlayerHUD => {
    const el = document.createElement('div')
    el.id = 'player-hud'
    el.style.cssText = [
        'position:fixed;top:16px;left:16px;',
        'background:rgba(0,0,0,.6);color:#fff;',
        'font:13px/1.6 monospace;padding:10px 14px;',
        'border-radius:8px;min-width:200px;',
        'pointer-events:none;z-index:100;',
        'display:none;',
    ].join(' ')

    const label = document.createElement('div')
    label.style.cssText = 'font-size:11px;opacity:.7;margin-bottom:2px'
    label.textContent = 'PLAYER HP'
    el.appendChild(label)

    const barOuter = document.createElement('div')
    barOuter.style.cssText = 'height:8px;background:rgba(255,255,255,.15);border-radius:4px;margin:4px 0;overflow:hidden'
    const barInner = document.createElement('div')
    barInner.style.cssText = 'height:100%;width:100%;background:#44ff44;border-radius:4px;transition:width .15s,background .15s'
    barOuter.appendChild(barInner)
    el.appendChild(barOuter)

    const hpText = document.createElement('div')
    hpText.style.cssText = 'text-align:right;font-size:12px;margin-bottom:6px'
    el.appendChild(hpText)

    const separator = document.createElement('div')
    separator.style.cssText = 'border-top:1px solid rgba(255,255,255,.15);margin:4px 0'
    el.appendChild(separator)

    const stateEl = document.createElement('div')
    stateEl.style.cssText = 'font-size:12px'
    el.appendChild(stateEl)

    const attackSection = document.createElement('div')
    attackSection.style.cssText = 'margin-top:2px'
    const atkLabel = document.createElement('span')
    atkLabel.textContent = 'ATK '
    atkLabel.style.cssText = 'font-size:11px;opacity:.7'
    attackSection.appendChild(atkLabel)
    const atkBarOuter = document.createElement('div')
    atkBarOuter.style.cssText = 'height:6px;background:rgba(255,255,255,.15);border-radius:3px;margin:2px 0;overflow:hidden;display:inline-block;width:80px;vertical-align:middle'
    const atkBarInner = document.createElement('div')
    atkBarInner.style.cssText = 'height:100%;width:0%;background:#ffaa00;border-radius:3px;transition:width .1s'
    atkBarOuter.appendChild(atkBarInner)
    attackSection.appendChild(atkBarOuter)
    const atkText = document.createElement('span')
    atkText.style.cssText = 'font-size:11px;margin-left:4px;vertical-align:middle'
    attackSection.appendChild(atkText)
    attackSection.style.display = 'none'
    el.appendChild(attackSection)

    const skillsTitle = document.createElement('div')
    skillsTitle.style.cssText = 'font-size:11px;opacity:.7;margin-top:4px'
    skillsTitle.textContent = 'SKILLS'
    el.appendChild(skillsTitle)
    const skillsList = document.createElement('div')
    skillsList.style.cssText = 'font-size:11px'
    el.appendChild(skillsList)

    document.body.appendChild(el)

    let skillRows: HTMLDivElement[] = []

    const ensureSkillRows = (count: number): void => {
        while (skillRows.length < count) {
            const row = document.createElement('div')
            row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:1px'
            const idx = document.createElement('span')
            idx.style.cssText = 'opacity:.5;min-width:14px'
            const bar = document.createElement('div')
            bar.style.cssText = 'height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;flex:1'
            const barFill = document.createElement('div')
            barFill.style.cssText = 'height:100%;width:100%;background:#4488ff;border-radius:2px;transition:width .15s'
            bar.appendChild(barFill)
            const text = document.createElement('span')
            text.style.cssText = 'min-width:60px;text-align:right'
            row.appendChild(idx)
            row.appendChild(bar)
            row.appendChild(text)
            skillsList.appendChild(row)
            skillRows.push(row)
        }
        while (skillRows.length > count) {
            const removed = skillRows.pop()
            if (removed) removed.remove()
        }
    }

    const update = (data: PlayerHUDData): void => {
        const pct = Math.max(0, Math.min(1, data.health / data.maxHealth))
        barInner.style.width = `${pct * 100}%`
        if (pct > 0.5) barInner.style.background = '#44ff44'
        else if (pct > 0.25) barInner.style.background = '#ffaa00'
        else barInner.style.background = '#ff4444'
        hpText.textContent = `${data.health} / ${data.maxHealth}`

        stateEl.textContent = `ST: ${data.stateName}  ${data.stateTime.toFixed(2)}s`

        const isAttacking = data.stateName === 'attacking'
        if (isAttacking) {
            attackSection.style.display = ''
            const atkPct = data.attackDuration > 0
                ? Math.min(1, data.attackTimer / data.attackDuration)
                : 0
            atkBarInner.style.width = `${atkPct * 100}%`
            atkText.textContent = `${data.attackTimer.toFixed(2)}s / ${data.attackDuration.toFixed(2)}s`
        } else {
            attackSection.style.display = 'none'
        }

        const skillCount = data.skills.length
        ensureSkillRows(skillCount)
        for (let i = 0; i < skillCount; i++) {
            const skill = data.skills[i]
            const row = skillRows[i]
            const idx = row.children[0] as HTMLElement
            const bar = row.children[1] as HTMLElement
            const fill = bar.children[0] as HTMLElement
            const text = row.children[2] as HTMLElement
            idx.textContent = `${i}:`
            const cdPct = skill.cooldownMax > 0
                ? 1 - Math.min(1, skill.cooldownTimer / skill.cooldownMax)
                : 0
            fill.style.width = `${cdPct * 100}%`
            if (skill.cooldownTimer > 0) {
                fill.style.background = '#ff6644'
                text.textContent = `${skill.cooldownTimer.toFixed(1)}s`
            } else {
                fill.style.background = '#44ff44'
                text.textContent = 'RDY'
            }
        }
    }

    const setVisible = (visible: boolean): void => {
        el.style.display = visible ? '' : 'none'
    }

    const destroy = (): void => { el.remove() }

    return {update, setVisible, destroy}
}
