import type {PanelContext} from '../../box/base/ui'
import type {CharacterEntitySystem} from '../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {TendencyId, TendencyConfig} from '../../../character/faction.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'

export const createCharacterPanel = (ctx: Omit<CharacterEntitySystem, 'panel'>): PanelContext => {
    const el = document.createElement('div')
    el.id = 'character-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 240px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px'
    header.textContent = 'Character Control'
    el.appendChild(header)

    el.appendChild(createSection('Position'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'Y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.01'})

    el.appendChild(createSection('Config'))
    const speed = createLabeledNumberInput(el, 'Speed', {min: '0.1', step: '0.1', value: '6'})
    const jumpH = createLabeledNumberInput(el, 'JumpH', {min: '0.1', step: '0.1', value: '2'})
    const radius = createLabeledNumberInput(el, 'Radius', {min: '0.05', step: '0.01', value: '0.125'})
    const height = createLabeledNumberInput(el, 'Height', {min: '0.2', step: '0.01', value: '1'})

    el.appendChild(createSection('Faction'))
    const faction = createLabeledNumberInput(el, 'Faction', {min: '0', step: '1', value: '0'})
    const tendencyLabel = document.createElement('label')
    tendencyLabel.textContent = 'Tendency '
    const tendSelect = document.createElement('select')
    const TENDENCY_OPTIONS: ReadonlyArray<{value: TendencyId; label: string}> = [
        {value: 'hostileAll', label: 'Hostile All'},
        {value: 'hostileExceptSelf', label: 'Hostile Except Self'},
        {value: 'hostileTo', label: 'Hostile To...'},
        {value: 'hostileExcept', label: 'Hostile Except...'},
        {value: 'pacifist', label: 'Pacifist'},
    ]
    for (const opt of TENDENCY_OPTIONS) {
        const o = document.createElement('option')
        o.value = opt.value; o.textContent = opt.label
        tendSelect.appendChild(o)
    }
    tendencyLabel.appendChild(tendSelect)
    el.appendChild(tendencyLabel)

    const targetFactionsLabel = document.createElement('label')
    targetFactionsLabel.textContent = 'TargetFactions '
    targetFactionsLabel.style.cssText = 'display:none'
    const targetFactionsInput = document.createElement('input')
    targetFactionsInput.type = 'text'
    targetFactionsInput.placeholder = '1,2,3'
    targetFactionsInput.style.cssText = 'width:80px;margin-left:4px'
    targetFactionsLabel.appendChild(targetFactionsInput)
    el.appendChild(targetFactionsLabel)

    const showTargetFactions = (): void => {
        const needs = tendSelect.value === 'hostileTo' || tendSelect.value === 'hostileExcept'
        targetFactionsLabel.style.display = needs ? '' : 'none'
        if (!needs) targetFactionsInput.value = ''
    }
    tendSelect.onchange = showTargetFactions

    const buildTendencyConfig = (): TendencyConfig => {
        const tendencyId = tendSelect.value as TendencyId
        if (tendencyId === 'hostileTo' || tendencyId === 'hostileExcept') {
            const raw = targetFactionsInput.value.trim()
            const factions = raw.length > 0
                ? raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
                : []
            return {tendencyId, targetFactions: factions}
        }
        return {tendencyId}
    }

    el.appendChild(createSection('Attack'))
    const atkTypeRow = document.createElement('div')
    atkTypeRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const atkSelectLabel = document.createElement('label')
    atkSelectLabel.textContent = 'Type '
    const atkSelect = document.createElement('select')
    const meleeOpt = document.createElement('option')
    meleeOpt.value = 'melee'; meleeOpt.textContent = 'Melee'
    const rangedOpt = document.createElement('option')
    rangedOpt.value = 'ranged'; rangedOpt.textContent = 'Ranged'
    atkSelect.appendChild(meleeOpt)
    atkSelect.appendChild(rangedOpt)
    atkSelectLabel.appendChild(atkSelect)
    atkTypeRow.appendChild(atkSelectLabel)
    el.appendChild(atkTypeRow)

    const atkRange = createLabeledNumberInput(el, 'Range', {min: '0.1', step: '0.1', value: '1.5'})
    const atkDmg = createLabeledNumberInput(el, 'Damage', {min: '0.1', step: '0.1', value: '3'})
    const atkCD = createLabeledNumberInput(el, 'Cooldown', {min: '0.1', step: '0.1', value: '0.5'})
    const atkDuration = createLabeledNumberInput(el, 'Duration', {min: '0.05', step: '0.05', value: '0.3'})
    el.appendChild(document.createElement('br'))
    const bulletSpeed = createLabeledNumberInput(el, 'BulSpd', {min: '1', step: '1', value: '20'})
    const bulletKB = createLabeledNumberInput(el, 'BulKnock', {min: '0', step: '0.5', value: '3'})
    const bulletLife = createLabeledNumberInput(el, 'BulLife', {min: '0.5', step: '0.5', value: '3'})

    el.appendChild(createSection('Health'))
    const maxHP = createLabeledNumberInput(el, 'MaxHP', {min: '1', step: '1', value: '15'})
    const curHP = createLabeledNumberInput(el, 'CurHP', {min: '0', step: '1', value: '15'})

    el.appendChild(createSection('Player'))
    const playerRow = document.createElement('div')
    playerRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const playerCheck = document.createElement('input')
    playerCheck.type = 'checkbox'
    playerCheck.id = 'chk-player'
    const playerLabel = document.createElement('label')
    playerLabel.htmlFor = 'chk-player'
    playerLabel.textContent = ' Mark as Player'
    playerLabel.style.cssText = 'cursor:pointer'
    playerRow.appendChild(playerCheck)
    playerRow.appendChild(playerLabel)
    el.appendChild(playerRow)

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const showRanged = () => {
        [bulletSpeed, bulletKB, bulletLife, atkDuration].forEach(input => {
            input.parentElement!.style.display = atkSelect.value === 'ranged' ? '' : 'none'
        })
    }
    atkSelect.onchange = showRanged

    const getSelected = (): CharacterEntity | undefined => {
        const id = ctx.getSelectedId()
        if (id === undefined) return undefined
        return ctx.getAll().find(c => c.id === id)
    }

    return {
        render: (container: HTMLElement) => {
            const sel = getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'

            posX.value = sel.mesh.position.x.toFixed(2)
            posY.value = sel.mesh.position.y.toFixed(2)
            posZ.value = sel.mesh.position.z.toFixed(2)

            speed.value = String(sel.config.speed)
            jumpH.value = String(sel.config.jumpHeight)
            radius.value = String(sel.config.radius)
            height.value = String(sel.config.height)

            const skill = sel.combat.skills[sel.combat.currentSkillIndex]
            maxHP.value = String(sel.combat.maxHealth)
            curHP.value = String(sel.combat.health)
            faction.value = String(sel.combat.faction)
            tendSelect.value = sel.combat.tendencyConfig.tendencyId
            targetFactionsInput.value = sel.combat.tendencyConfig.targetFactions?.join(',') ?? ''
            showTargetFactions()
            atkRange.value = String(skill?.config.range ?? 1.5)
            atkDmg.value = String(skill?.config.damage ?? 3)
            atkCD.value = String(skill?.config.cooldown ?? 0.5)
            atkDuration.value = String(skill?.config.duration ?? 0.3)
            atkSelect.value = skill?.config.type ?? 'melee'
            playerCheck.checked = sel.isPlayer

            if (skill?.config.type === 'ranged') {
                bulletSpeed.value = String(skill.config.projectileSpeed)
                bulletKB.value = String(skill.config.knockbackForce)
                bulletLife.value = String(skill.config.projectileLifetime)
            }
            showRanged()

            playerCheck.onchange = () => {
                // 不直接调用 setPlayerId，等 Apply 统一提交
            }

            const onApply = () => {
                const cur = getSelected()
                if (!cur) return
                ctx.setTransform?.(cur.id,
                    {x: parseFloat(posX.value), y: parseFloat(posY.value), z: parseFloat(posZ.value)},
                )
                if (playerCheck.checked) ctx.markPlayer(cur.id)
                else ctx.unmarkPlayer()
                const isRanged = atkSelect.value === 'ranged'
                ctx.updateCharacterConfig?.(cur.id, {
                    speed: parseFloat(speed.value),
                    jumpHeight: parseFloat(jumpH.value),
                    radius: parseFloat(radius.value),
                    height: parseFloat(height.value),
                }, isRanged ? {
                    type: 'ranged',
                    range: parseFloat(atkRange.value),
                    damage: parseFloat(atkDmg.value),
                    cooldown: parseFloat(atkCD.value),
                    duration: parseFloat(atkDuration.value),
                    bulletSpeed: parseFloat(bulletSpeed.value),
                    bulletKnockback: parseFloat(bulletKB.value),
                    bulletLifetime: parseFloat(bulletLife.value),
                } : {
                    type: 'melee',
                    range: parseFloat(atkRange.value),
                    damage: parseFloat(atkDmg.value),
                    cooldown: parseFloat(atkCD.value),
                    duration: parseFloat(atkDuration.value),
                }, parseFloat(faction.value), parseFloat(maxHP.value), buildTendencyConfig(), parseFloat(curHP.value))
            }

            const onDelete = () => {
                const cur = getSelected()
                if (cur) ctx.remove(cur.id)
            }
            applyBtn.onclick = onApply
            deleteBtn.onclick = onDelete
        },
        destroy: () => {
            el.remove()
        },
    }
}
