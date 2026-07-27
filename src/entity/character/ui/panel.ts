import type {PanelContext} from '../../box/base/ui'
import type {CharacterEntitySystem} from '../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
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

    el.appendChild(createSection('Combat'))
    const maxHP = createLabeledNumberInput(el, 'MaxHP', {min: '1', step: '1', value: '15'})
    const faction = createLabeledNumberInput(el, 'Faction', {min: '0', step: '1', value: '0'})
    const atkRange = createLabeledNumberInput(el, 'AtkRange', {min: '0.1', step: '0.1', value: '1.5'})
    const atkDmg = createLabeledNumberInput(el, 'AtkDmg', {min: '0.1', step: '0.1', value: '3'})
    const atkCD = createLabeledNumberInput(el, 'AtkCD', {min: '0.1', step: '0.1', value: '0.5'})
    const atkDuration = createLabeledNumberInput(el, 'Duration', {min: '0.05', step: '0.05', value: '0.3'})
    const bulletSpeed = createLabeledNumberInput(el, 'BulSpd', {min: '1', step: '1', value: '20'})
    const bulletKB = createLabeledNumberInput(el, 'BulKnock', {min: '0', step: '0.5', value: '3'})
    const bulletLife = createLabeledNumberInput(el, 'BulLife', {min: '0.5', step: '0.5', value: '3'})

    el.appendChild(createSection('AttackType'))
    const atkTypeRow = document.createElement('div')
    atkTypeRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const atkSelect = document.createElement('select')
    atkSelect.style.cssText = 'flex:1'
    const meleeOpt = document.createElement('option')
    meleeOpt.value = 'melee'; meleeOpt.textContent = 'Melee'
    const rangedOpt = document.createElement('option')
    rangedOpt.value = 'ranged'; rangedOpt.textContent = 'Ranged'
    atkSelect.appendChild(meleeOpt)
    atkSelect.appendChild(rangedOpt)
    atkTypeRow.appendChild(atkSelect)
    el.appendChild(atkTypeRow)

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

            maxHP.value = String(sel.maxHealth)
            faction.value = String(sel.faction)
            atkRange.value = String(sel.attackSlot.range)
            atkDmg.value = String(sel.attackSlot.damage)
            atkCD.value = String(sel.attackSlot.cooldown)
            atkDuration.value = String(sel.attackSlot.duration)
            atkSelect.value = sel.attackSlot.type
            playerCheck.checked = sel.isPlayer

            if (sel.attackSlot.type === 'ranged') {
                bulletSpeed.value = String(sel.attackSlot.bulletSpeed)
                bulletKB.value = String(sel.attackSlot.bulletKnockback)
                bulletLife.value = String(sel.attackSlot.bulletLifetime)
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
                }, parseFloat(faction.value), parseFloat(maxHP.value))
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
